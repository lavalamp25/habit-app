import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Preprocess für Svelte
	preprocess: vitePreprocess(),

	kit: {
		// Adapter für Node.js, damit Render die App starten kann
		adapter: adapter({
			// optional: Standardoptionen reichen für Render
		}),

		// Optional: Vite Server Port auf process.env.PORT setzen
		vite: {
			server: {
				port: process.env.PORT || 4173
			}
		}
	}
};

export default config;