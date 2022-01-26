import axios from 'axios';
import config from 'config';
import qs from 'qs';

const main = async () => {
	const res = await axios.get(
		'https://accounts.google.com/.well-known/openid-configuration'
	);
	const openidConfig = res.data;

	const params = {
		client_id: process.env.CLIENT_ID,
		response_type: 'code',
		scope: config.get('authRequest.scopes').join(' '),
		redirect_uri: config.get('authRequest.redirectUri')
	};

	console.log(`${openidConfig.authorization_endpoint}?${qs.stringify(params)}`);
};

main()
	.then(() => {
		console.log('OK');
	})
	.catch((e) => {
		console.error('NG', e);
	});
