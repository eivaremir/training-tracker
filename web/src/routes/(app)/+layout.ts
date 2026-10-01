// Every screen in this group requires a signed-in user.
import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth.svelte';

export const load = ({ url }) => {
  if (!auth.isAuthenticated) redirect(307, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
};
