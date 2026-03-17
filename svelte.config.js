import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// AI: use the explicit Node adapter because the app relies on server loads and dynamic private env for Strapi.
		adapter: adapter()
	}
};

export default config;
