import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div class="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
        <div class="text-center mb-8">
          <div class="w-16 h-16 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg text-white">
            <i class="pi pi-lock text-2xl"></i>
          </div>
          <h1 class="text-2xl font-bold text-slate-800">Admin Login</h1>
          <p class="text-slate-500 mt-2">Sign in to manage the Somiti</p>
        </div>

        <form (ngSubmit)="onSubmit()" class="space-y-6">
          <div class="space-y-2">
            <label class="text-sm font-bold text-slate-700 ml-1">Email / Member ID</label>
            <div class="relative">
              <i class="pi pi-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input type="email" [(ngModel)]="email" name="email" required
                class="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-slate-800 font-medium placeholder-slate-400"
                placeholder="admin@example.com">
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-bold text-slate-700 ml-1">Password</label>
            <div class="relative">
              <i class="pi pi-key absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input type="password" [(ngModel)]="password" name="password" required
                class="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-slate-800 font-medium placeholder-slate-400"
                placeholder="••••••••">
            </div>
          </div>

          @if (errorMessage()) {
            <div class="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium flex items-center gap-2">
              <i class="pi pi-exclamation-circle"></i>
              {{ errorMessage() }}
            </div>
          }

          <button type="submit" [disabled]="loading()"
            class="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-2xl shadow-[0_4px_14px_0_rgba(99,102,241,0.39)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.23)] hover:-translate-y-0.5 transition-all outline-none disabled:opacity-70 disabled:hover:translate-y-0 relative overflow-hidden group">
            
            <span class="flex items-center justify-center gap-2 relative z-10">
              @if (loading()) {
                <i class="pi pi-spinner pi-spin"></i> Authenticating...
              } @else {
                <span>Sign In</span> <i class="pi pi-arrow-right text-sm"></i>
              }
            </span>
          </button>
          
          <div class="text-center mt-6">
            <a routerLink="/" class="text-sm text-slate-500 hover:text-primary-600 font-medium transition-colors">
              <i class="pi pi-arrow-left text-xs mr-1"></i> Back to Dashboard
            </a>
          </div>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  errorMessage = signal('');

  async onSubmit() {
    if (!this.email || !this.password) {
      this.errorMessage.set('Please provide both email and password.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      await this.authService.signIn(this.email, this.password);
      this.router.navigate(['/admin']);
    } catch (e: any) {
      this.errorMessage.set(e.message || 'Invalid login credentials.');
    } finally {
      this.loading.set(false);
    }
  }
}
