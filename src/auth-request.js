import axios from 'axios';

const main = async () => {
	const res = await axios.get(
		'https://accounts.google.com/.well-known/openid-configuration'
	);
	const openidConfig = res.data;

	console.log(openidConfig.authorization_endpoint);
};

main()
	.then(() => {
		console.log('OK');
	})
	.catch((e) => {
		console.error('NG', e);
	});
