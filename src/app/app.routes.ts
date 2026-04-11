import { Routes } from '@angular/router';
import { Dashboard } from './dashboard/dashboard';
import { AdminPanel } from './admin-panel/admin-panel';
import { LoginComponent } from './login/login.component';
import { adminGuard } from './admin.guard';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'dashboard', component: Dashboard },
  { path: 'login', component: LoginComponent },
  { path: 'admin', component: AdminPanel, canActivate: [adminGuard] }
];
