// server/controllers/authController.js
const ADMIN_USERNAME = 'saleemSultan';
const ADMIN_PASSWORD = 'totaloil123';

// Keep cookie name in one place (must match express-session 'name' option)
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'lat.sid';

exports.login = async (req, res) => {
  try {
    const { cnic, mobile } = req.body;

    if (cnic !== ADMIN_USERNAME || mobile !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Regenerate for safety, then persist user in session
    req.session.regenerate((err) => {
      if (err) {
        console.error('session regenerate error:', err);
        return res.status(500).json({ error: 'Session error' });
      }

      req.session.user = { username: ADMIN_USERNAME };

      // Ensure the session is saved before sending cookies
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('session save error:', saveErr);
          return res.status(500).json({ error: 'Session error' });
        }
        res.json({ message: 'Login successful', user: { username: ADMIN_USERNAME } });
      });
    });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'Internal error' });
  }
};

exports.logout = (req, res) => {
  const cookieOpts = {
    // must match what you set in express-session (path/sameSite/secure)
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1'
  };

  req.session.destroy((err) => {
    if (err) {
      console.error('session destroy error:', err);
      // still try to clear the cookie
    }
    // Clear the exact cookie name and path
    res.clearCookie(SESSION_COOKIE_NAME, cookieOpts);
    res.json({ message: 'Logged out' });
  });
};

exports.getCurrentUser = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json(req.session.user);
};

// Optional: guard middleware you can use on protected routes
exports.requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not logged in' });
  next();
};
