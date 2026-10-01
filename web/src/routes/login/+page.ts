import { redirect } from '@sveltejs/kit';
import { auth, safeNext } from '$lib/auth.svelte';

// Already signed in → skip the form.
export const load = ({ url }) => {
  if (auth.isAuthenticated) redirect(307, safeNext(url.searchParams.get('next')));
};
