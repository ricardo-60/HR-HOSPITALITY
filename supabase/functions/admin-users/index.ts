import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigins = new Set(
  (Deno.env.get('APP_ALLOWED_ORIGINS') || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);

const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const roles = new Set(['ADMINISTRATOR', 'PERMISSAO', 'ACESSO']);
const statuses = new Set(['ATIVO', 'BLOQUEADO']);
const allowedModules = new Set([
  'alojamento', 'eventos', 'facilities', 'lavandaria', 'logistica',
  'parque', 'pos', 'rh', 'snack-bar', 'spa', 'transfer', 'ajuda', 'configuracoes'
]);
const restrictions = new Set([
  '/alojamento', '/eventos', '/facilities', '/lavandaria', '/logistica',
  '/parque', '/pos', '/rh', '/snack-bar', '/spa', '/transfer', '/ajuda', '/configuracoes'
]);

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Bootstrap-Token, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function requiredString(value: unknown, field: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`Invalid field: ${field}`);
  }
  return value.trim();
}

function validEmail(value: unknown): string {
  const email = requiredString(value, 'email', 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email.');
  return email;
}

function employeeCode(value: unknown): string {
  const code = requiredString(value, 'employeeCode', 64).toUpperCase();
  if (!/^[A-Z0-9_-]{2,64}$/.test(code)) throw new Error('Invalid employee code.');
  return code;
}

function stringList(value: unknown, allowed: Set<string>, withSlash = false): string[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error('Invalid permission list.');
  const result = [...new Set(value.map(item => {
    if (typeof item !== 'string') throw new Error('Invalid permission item.');
    const normalized = withSlash ? (item.startsWith('/') ? item : `/${item}`) : item;
    if (!allowed.has(normalized)) throw new Error('Unsupported permission item.');
    return normalized;
  }))];
  return result;
}

function safeProfile(row: Record<string, unknown>) {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    tenantId: row.tenant_id,
    email: row.email,
    employeeCode: row.employee_code,
    name: row.name,
    role: row.role,
    commissionRate: Number(row.commission_rate || 0),
    restrictions: row.restrictions || [],
    allowedModules: row.allowed_modules || [],
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password)
  };
}

function validateProfileInput(input: Record<string, unknown>) {
  const role = requiredString(input.role, 'role', 32);
  const status = requiredString(input.status, 'status', 32);
  if (!roles.has(role)) throw new Error('Invalid role.');
  if (!statuses.has(status)) throw new Error('Invalid status.');
  const commissionRate = Number(input.commissionRate);
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 0.5) {
    throw new Error('Invalid commission rate.');
  }
  const modules = role === 'ACESSO'
    ? stringList(input.allowedModules, allowedModules)
    : ['*'];
  const blocked = role === 'PERMISSAO'
    ? stringList(input.restrictions, restrictions, true)
    : [];
  return {
    email: validEmail(input.email),
    employeeCode: employeeCode(input.employeeCode),
    name: requiredString(input.name, 'name', 160),
    role,
    status,
    commissionRate,
    restrictions: blocked,
    allowedModules: modules
  };
}

async function requireAuthenticated(request: Request) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw new Error('Missing bearer token.');

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Invalid session.');

  const { data: profile, error } = await serviceClient
    .from('app_users')
    .select('*')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (error || !profile || profile.status !== 'ATIVO') {
    throw new Error('Active profile required.');
  }
  return { user: userData.user, profile };
}

async function requireAdmin(request: Request) {
  const actor = await requireAuthenticated(request);
  if (actor.profile.role !== 'ADMINISTRATOR') throw new Error('Administrator access required.');
  return actor.profile;
}

async function inviteUser(input: Record<string, unknown>, tenantId: string) {
  const profile = validateProfileInput(input);
  const { data: existing, error: existingError } = await serviceClient
    .from('app_users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('employee_code', profile.employeeCode)
    .maybeSingle();
  if (existingError) throw new Error('Could not validate employee code.');
  if (existing) throw new Error('Employee code already exists.');

  const redirectTo = Deno.env.get('SUPABASE_AUTH_REDIRECT_URL') || undefined;
  const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(
    profile.email,
    {
      redirectTo,
      data: { employee_code: profile.employeeCode, full_name: profile.name }
    }
  );
  if (inviteError || !invited.user) throw new Error('Could not invite user.');

  const { data: created, error: insertError } = await serviceClient
    .from('app_users')
    .insert({
      auth_user_id: invited.user.id,
      tenant_id: tenantId,
      email: profile.email,
      employee_code: profile.employeeCode,
      name: profile.name,
      role: profile.role,
      status: profile.status,
      commission_rate: profile.commissionRate,
      restrictions: profile.restrictions,
      allowed_modules: profile.allowedModules,
      must_change_password: true
    })
    .select('*')
    .single();

  if (insertError) {
    await serviceClient.auth.admin.deleteUser(invited.user.id);
    throw new Error('Could not create the protected user profile.');
  }
  return safeProfile(created);
}

async function updateUser(caller: Record<string, unknown>, input: Record<string, unknown>) {
  const code = employeeCode(input.profileEmployeeCode);
  const profile = validateProfileInput(input);
  const { data: target, error } = await serviceClient
    .from('app_users')
    .select('*')
    .eq('tenant_id', caller.tenant_id)
    .eq('employee_code', code)
    .not('auth_user_id', 'is', null)
    .maybeSingle();
  if (error || !target) throw new Error('User profile not found.');

  if (target.auth_user_id === caller.auth_user_id && (profile.role !== caller.role || profile.status !== caller.status)) {
    throw new Error('You cannot change your own role or status.');
  }

  const { error: authError } = await serviceClient.auth.admin.updateUserById(target.auth_user_id, {
    email: profile.email,
    email_confirm: true
  });
  if (authError) throw new Error('Could not update the authentication identity.');

  const { data: updated, error: updateError } = await serviceClient
    .from('app_users')
    .update({
      email: profile.email,
      name: profile.name,
      role: profile.role,
      status: profile.status,
      commission_rate: profile.commissionRate,
      restrictions: profile.restrictions,
      allowed_modules: profile.allowedModules,
      must_change_password: profile.status === 'ATIVO' ? target.must_change_password : true
    })
    .eq('id', target.id)
    .select('*')
    .single();
  if (updateError) throw new Error('Could not update the protected profile.');
  return safeProfile(updated);
}

async function deleteUser(caller: Record<string, unknown>, input: Record<string, unknown>) {
  const code = employeeCode(input.profileEmployeeCode);
  if (code === employeeCode(caller.employee_code)) throw new Error('You cannot delete your own account.');
  const { data: target, error } = await serviceClient
    .from('app_users')
    .select('auth_user_id')
    .eq('tenant_id', caller.tenant_id)
    .eq('employee_code', code)
    .not('auth_user_id', 'is', null)
    .maybeSingle();
  if (error || !target) throw new Error('User profile not found.');
  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(target.auth_user_id);
  if (deleteError) throw new Error('Could not delete the authentication identity.');
  return { deleted: true };
}

async function changeOwnPassword(actor: { user: { id: string; email?: string }; profile: Record<string, unknown> }, input: Record<string, unknown>) {
  const currentPassword = requiredString(input.currentPassword, 'currentPassword', 200);
  const newPassword = requiredString(input.newPassword, 'newPassword', 200);
  if (newPassword.length < 8 || newPassword === currentPassword) throw new Error('Invalid new password.');
  if (!actor.user.email) throw new Error('Authenticated user has no email.');

  const { error: verifyError } = await authClient.auth.signInWithPassword({
    email: actor.user.email,
    password: currentPassword
  });
  if (verifyError) throw new Error('Current password is invalid.');

  const { error: updateError } = await serviceClient.auth.admin.updateUserById(actor.user.id, { password: newPassword });
  if (updateError) throw new Error('Could not update the authentication password.');

  const { error: profileError } = await serviceClient
    .from('app_users')
    .update({ must_change_password: false })
    .eq('id', actor.profile.id);
  if (profileError) throw new Error('Password changed, but profile flag could not be updated.');

  return { changed: true };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

  if (origin && !allowedOrigins.has(origin)) return respond({ error: 'Origin not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  try {
    const input = await request.json() as Record<string, unknown>;
    const action = requiredString(input.action, 'action', 32);

    if (action === 'bootstrap') {
      const expected = Deno.env.get('BOOTSTRAP_TOKEN');
      const supplied = request.headers.get('X-Bootstrap-Token');
      if (!expected || !supplied || supplied !== expected) throw new Error('Bootstrap token required.');
      const { data: admins, error } = await serviceClient
        .from('app_users')
        .select('id')
        .eq('role', 'ADMINISTRATOR')
        .eq('status', 'ATIVO')
        .not('auth_user_id', 'is', null)
        .limit(1);
      if (error) throw new Error('Could not verify bootstrap state.');
      if (admins && admins.length > 0) throw new Error('Bootstrap is already completed.');
      const tenantId = '11111111-1111-1111-1111-111111111111';
      const profile = await inviteUser(input, tenantId);
      return respond({ profile }, 201);
    }

    if (action === 'change-password') {
      const actor = await requireAuthenticated(request);
      return respond(await changeOwnPassword(actor, input));
    }

    const caller = await requireAdmin(request);
    if (action === 'invite') return respond({ profile: await inviteUser(input, caller.tenant_id) }, 201);
    if (action === 'update') return respond({ profile: await updateUser(caller, input) });
    if (action === 'delete') return respond(await deleteUser(caller, input));
    return respond({ error: 'Unknown action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed.';
    const status = /session|administrator|bearer|origin/i.test(message) ? 403 : 400;
    return respond({ error: message }, status);
  }
});
