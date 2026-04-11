import { Injectable, signal } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  
  // Expose the current user as a signal
  readonly currentUser = signal<User | null>(null);

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    
    // Check initial session
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      this.currentUser.set(session?.user || null);
    });

    // Listen for auth state changes (login, logout)
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.currentUser.set(session?.user || null);
    });
  }

  // Login
  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  // Logout
  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  // Expose base supabase client for other services
  get client(): SupabaseClient {
    return this.supabase;
  }
}
