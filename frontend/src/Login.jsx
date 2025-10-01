import React, { useState } from 'react';
import axios from 'axios';

// Use relative path for API to avoid double /api in dev
const API_BASE_URL = '';

const Login = ({ onLogin }) => {
  const [loginForm, setLoginForm] = useState({ userId: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember7Days, setRemember7Days] = useState(false);

  const handleInputChange = (e) => {
    setLoginForm({
      ...loginForm,
      [e.target.name]: e.target.value
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/login`, { ...loginForm, remember7Days });
      const { token } = response.data;
      localStorage.setItem('token', token);
      // Let parent verify token by fetching profile before entering dashboard
      onLogin(token);
    } catch (error) {
      setError(error.response?.data?.message || 'Login failed, please check your account and password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <h1 className="login-title">Welcome back</h1>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label htmlFor="userId" className="form-label">Account</label>
          <input
            type="text"
            id="userId"
            name="userId"
            value={loginForm.userId}
            onChange={handleInputChange}
            className="form-input"
            required
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password" className="form-label">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={loginForm.password}
            onChange={handleInputChange}
            className="form-input"
            required
            disabled={loading}
          />
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            id="remember7Days"
            name="remember7Days"
            checked={remember7Days}
            onChange={(e) => setRemember7Days(e.target.checked)}
            disabled={loading}
          />
          <label htmlFor="remember7Days" className="form-label">Stay signed in for 7 days</label>
        </div>
        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'Logging in...' : 'Continue'}
        </button>
      </form>
    </div>
  );
};

export default Login;