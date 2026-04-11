import { Routes } from '@angular/router';
import { Dashboard } from './dashboard/dashboard';
import { AdminPanel } from './admin-panel/admin-panel';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'dashboard', component: Dashboard },
  { path: 'admin', component: AdminPanel }
];
