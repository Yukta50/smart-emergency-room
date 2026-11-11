const authFeedbackStorageKey = 'erflow-auth-feedback';

function showAuthScreen(screenName) {
  document.querySelectorAll('.auth-screen').forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.authScreen === screenName);
  });
}

function setAuthMessage(formId, message) {
  const messageId = formId === 'login-form' ? 'login-message' : 'register-account-message';
  document.getElementById(messageId).textContent = message;
}

async function submitAuthRequest(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'The request could not be completed.');
  }
  return result;
}

document.querySelectorAll('[data-auth-target]').forEach((button) => {
  button.addEventListener('click', () => {
    setAuthMessage('login-form', '');
    setAuthMessage('register-account-form', '');
    showAuthScreen(button.dataset.authTarget);
  });
});

const loginForm = document.getElementById('login-form');
if (loginForm) {
  const loginMessage = document.getElementById('login-message');
  const feedback = sessionStorage.getItem(authFeedbackStorageKey);
  if (feedback) {
    loginMessage.textContent = feedback;
    sessionStorage.removeItem(authFeedbackStorageKey);
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('login-user').value.trim().toLowerCase();
    const password = document.getElementById('login-pass').value;

    try {
      await submitAuthRequest('/api/auth/login', { username, password });
      const loginOverlay = document.getElementById('login-overlay');
      if (loginOverlay) {
        loginOverlay.classList.add('hidden');
        window.dispatchEvent(new Event('erflow:authenticated'));
      } else {
        window.location.href = 'index.html';
      }
    } catch (error) {
      console.error('Unable to sign in:', error);
      loginMessage.textContent = error.message || 'Unable to sign in. Please try again.';
    }
  });
}

const registerForm = document.getElementById('register-account-form');
if (registerForm) {
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const name = formData.get('name').trim();
    const username = formData.get('username').trim().toLowerCase();
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const registerMessage = document.getElementById('register-account-message');

    if (password !== confirmPassword) {
      registerMessage.textContent = 'Passwords do not match.';
      return;
    }

    try {
      const result = await submitAuthRequest('/api/auth/register', {
        name,
        username,
        password,
      });

      if (document.getElementById('login-overlay')) {
        registerForm.reset();
        document.getElementById('login-user').value = username;
        document.getElementById('login-pass').value = '';
        setAuthMessage('login-form', result.message);
        showAuthScreen('login');
        document.getElementById('login-pass').focus();
      } else {
        sessionStorage.setItem(authFeedbackStorageKey, result.message);
        window.location.href = 'login.html';
      }
    } catch (error) {
      registerMessage.textContent = error.message || 'Unable to create the account. Please try again.';
    }
  });
}

const logoutButton = document.getElementById('logout-btn');
if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await submitAuthRequest('/api/auth/logout', {});
    } catch (error) {
      console.error('Unable to sign out:', error);
      setAuthMessage('login-form', 'Unable to sign out. Please try again.');
      return;
    }
    document.getElementById('login-pass').value = '';
    setAuthMessage('login-form', '');
    showAuthScreen('login');
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('login-user').focus();
  });
}
