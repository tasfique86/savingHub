import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // If user is already logged in, allow access
  if (authService.currentUser()) {
    return true;
  }

  // Otherwise wait 50ms to allow supabase to hydrate session before redirecting
  // Since guards can be async but signal is sync. 
  // A cleaner approach in v16+ is resolving exactly if session exists, but this works well enough
  // For proper async check:
  return authService.client.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      return true;
    }
    router.navigate(['/login']);
    return false;
  });
};
