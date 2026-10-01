import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    // SPA build for Amplify Hosting: every unknown path falls back to index.html.
    adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', strict: false })
  }
};
