import 'source-map-support/register';
import 'dotenv/config';
import express from 'express';
import * as helmet from 'helmet';
import config from 'config';
import appRoot from 'app-root-path';

import expressSession from 'express-session';
import connectRedis from 'connect-redis';
import Redis from 'ioredis';

import { Issuer, generators } from 'openid-client';
import jwt from 'jsonwebtoken';

import { fromWebToken } from '@aws-sdk/credential-providers';
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda';

const app = express();
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', appRoot.resolve('src/views'));

const redis = new Redis();
const RedisStore = connectRedis(expressSession);
const store = new RedisStore({ client: redis });

app.use(
	expressSession({
		...config.get('redis.session'),
		secret: process.env.COOKIE_SECRET,
		store
	})
);
app.use(helmet.hidePoweredBy());
app.use(helmet.xssFilter());

Issuer.discover(config.get('discovery')).then((issuer) => {
	const oidcClient = new issuer.Client({
		client_id: process.env.CLIENT_ID,
		redirect_uri: config.get('redirectUri'),
		response_type: ['id_token']
	});

	app.locals.client = oidcClient;
});

app.get('/', (req, res) => {
	res.render('./index.ejs');
});

app.get('/begin', async (req, res) => {
	const { session } = req;
	const { client } = req.app.locals;

	const nonce = generators.nonce();
	session.nonce = nonce;

	const uri = client.authorizationUrl({
		scope: config.get('authRequest.scopes').join(' '),
		response_mode: 'form_post',
		nonce
	});

	res.redirect(uri);
});

app.post('/oidc/callback', async (req, res) => {
	const { session } = req;
	const { client } = req.app.locals;

	try {
		const params = client.callbackParams(req);
		const { id_token: idToken } = await client.callback(
			config.get('redirectUri'),
			params,
			{
				nonce: session.nonce
			}
		);

		console.log(jwt.decode(idToken, { complete: true }));

		const regenerate = (oldSession) => {
			return new Promise((resolve, reject) => {
				oldSession.regenerate((err) => {
					if (err) throw reject(err);
					const { session: newSession } = req;
					newSession.idToken = idToken;
					resolve(newSession);
				});
			});
		};
		await regenerate(session);

		res.render('./redirect.ejs', { idToken });
	} catch (error) {
		res.end(error.message);
	}
});

app.get('/getFunction', async (req, res) => {
	const { session } = req;

	try {
		const client = new LambdaClient({
			region: 'ap-northeast-1',
			credentials: fromWebToken({
				roleArn: process.env.ROLE_ARN,
				webIdentityToken: session.idToken,
				roleSessionName: 'test_session'
			})
		});
		const command = new GetFunctionCommand({
			FunctionName: 'rds-proxy-lambda-func'
		});
		const response = await client.send(command);
		console.log(response);

		res.status(200).json(response);
	} catch (error) {
		console.log(error);
		res.status(500).json(error.message);
	}
});

app.listen(3000, () => {
	console.log(`Server Start with HTTP`);
	console.log(`Endpoint is http://127.0.0.1:3000`);
});
