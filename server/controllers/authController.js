// server/controllers/authController.js
const ADMIN_USERNAME = 'saleemSultan';
const ADMIN_PASSWORD = 'totaloil123';

exports.login = async (req, res) => {
  const { cnic, mobile } = req.body;

  if (cnic !== ADMIN_USERNAME || mobile !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.user = { username: ADMIN_USERNAME };
  res.json({ message: 'Login successful', user: { username: ADMIN_USERNAME } });
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
};

exports.getCurrentUser = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json(req.session.user);
};
