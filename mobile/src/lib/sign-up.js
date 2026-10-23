const { validateSignIn, signInErrorKey } = require('./sign-in');

// Match the website's minimum; the server remains authoritative for password policy.
function validateSignUp(email, password, confirmation) {
  const errors = validateSignIn(email, password);
  if (password && password.length < 8) errors.password = 'passwordShort';
  if (!confirmation) errors.confirmation = 'confirmationRequired';
  else if (password !== confirmation) errors.confirmation = 'passwordMismatch';
  return errors;
}

async function createAccount(client, email, password, confirmation) {
  if (Object.keys(validateSignUp(email, password, confirmation)).length) {
    const error = new Error('Invalid sign-up fields');
    error.code = 'INVALID_FIELDS';
    throw error;
  }
  const { data, error } = await client.auth.signUp({
    email: email.trim(), password,
    options: { emailRedirectTo: 'https://kid-sync-delta.vercel.app/' }
  });
  if (error) throw error;
  if (!data?.user) throw new Error('Account creation did not complete');
  // No session means verification is still required, including privacy-preserving
  // responses for an existing email. Never claim that the user is signed in.
  return { status: data.session ? 'signedIn' : 'confirmation', email: email.trim() };
}

function signUpErrorKey(error) {
  if (error?.code === 'weak_password') return 'weakPassword';
  if (error?.code === 'email_address_invalid') return 'emailInvalid';
  if (error?.code === 'user_already_exists' || error?.code === 'email_exists') return 'alreadyRegistered';
  if (error?.code === 'signup_disabled' || error?.code === 'email_provider_disabled') return 'signupDisabled';
  return signInErrorKey(error);
}

module.exports = { validateSignUp, createAccount, signUpErrorKey };
