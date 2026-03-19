import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Use the Vercel adapter so the platform runs the app instead of serving the Node entry file as static output.
		adapter: adapter()
	}
};

export default config;
