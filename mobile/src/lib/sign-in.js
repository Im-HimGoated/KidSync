function validateSignIn(email, password) {
  const errors = {};
  if (!email.trim()) errors.email = 'emailRequired';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'emailInvalid';
  if (!password) errors.password = 'passwordRequired';
  return errors;
}

async function authenticate(client, email, password) {
  const errors = validateSignIn(email, password);
  if (Object.keys(errors).length) {
    const error = new Error('Invalid sign-in fields');
    error.code = 'INVALID_FIELDS';
    throw error;
  }
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

function signInErrorKey(error) {
  if (error?.code === 'invalid_credentials') return 'invalidCredentials';
  if (error?.code === 'email_not_confirmed') return 'emailNotConfirmed';
  if (error?.status === 429 || error?.code === 'over_request_rate_limit' || error?.code === 'over_email_send_rate_limit') return 'rateLimited';
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) return 'connectionFailed';
  return 'authFailed';
}

async function requestPasswordReset(client, email) {
  if (validateSignIn(email, 'unused').email) throw new Error('Invalid email');
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: 'https://kid-sync-delta.vercel.app/?recovery=1'
  });
  if (error) throw error;
}

module.exports = { validateSignIn, authenticate, signInErrorKey, requestPasswordReset };
