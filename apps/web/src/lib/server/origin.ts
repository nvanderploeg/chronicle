import { ORIGIN } from '$app/env/private';

export function publicOrigin(url: URL): string {
	return ORIGIN ?? url.origin;
}
