import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Login = () => {
  const [cnic, setCnic] = useState('');
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!window.customElements.get('model-viewer')) {
      import('@google/model-viewer').catch(() => {});
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post(
        '/api/login',
        { cnic: cnic.trim(), mobile: mobile.trim() },
        { withCredentials: true }
      );
      sessionStorage.setItem('user', JSON.stringify(res.data.user));
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom right, #000000, #4b0000)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <div
        className="container-fluid py-3"
        style={{ background: 'linear-gradient(to right, rgb(107, 16, 16),white, black)' }}
      >
        <div className="row justify-content-center">
          {['engine.glb', 'engine4.glb', 'engine2.glb', 'engine.glb'].map(
            (file, index) => (
              <div
                key={index}
                className="col-6 col-md-3 d-flex justify-content-center mb-3"
              >
                <model-viewer
                  src={`/models/${file}`}
                  alt={`Engine ${index + 1}`}
                  auto-rotate
                  camera-controls
                  disable-zoom
                  shadow-intensity="1"
                  interaction-prompt="none"
                  style={{
                    width: '100%',
                    height: '150px',
                    maxWidth: '180px',
                    background: 'transparent',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    borderRadius: '12px'
                  }}
                  className="engine-model"
                ></model-viewer>
              </div>
            )
          )}
        </div>
      </div>

      {/* Login Form */}
      <div
        className="d-flex justify-content-center align-items-center flex-fill py-4 px-3"
        style={{ flex: 1 }}
      >
        <div
          className="shadow-lg p-4"
          style={{
            width: '100%',
            maxWidth: '420px',
            borderRadius: '20px',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(15px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'white'
          }}
        >
          <h1 className="text-center mb-4 fw-bold" style={{ fontSize: '2rem' }}>
            LahoreAutoTraders
          </h1>
          <h4 className="text-center text-light mb-3">Log In</h4>
          <p className="text-center text-muted mb-4">
            Access your dashboard securely
          </p>

          {error && (
            <div className="alert alert-danger py-2 px-3 small" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="username" className="form-label text-light fw-semibold">
                Username
              </label>
              <input
                type="text"
                className="form-control bg-transparent text-white border-light"
                id="username"
                value={cnic}
                onChange={(e) => setCnic(e.target.value)}
                required
              />
            </div>

            <div className="mb-3">
              <label htmlFor="password" className="form-label text-light fw-semibold">
                Password
              </label>
              <input
                type="password"
                className="form-control bg-transparent text-white border-light"
                id="password"
                placeholder="Enter your password"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-danger w-100 fw-semibold shadow-sm"
              disabled={!cnic || !mobile}
            >
              Sign In
            </button>
          </form>

          <p className="mt-4 small text-light text-center">
            Don’t have an account?{' '}
            <a href="#" className="text-danger text-decoration-none">Sign Up</a>
          </p>
          <p className="small mt-1 text-center">
            <a href="#" className="text-danger text-decoration-none">Forget Password?</a>
          </p>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>
        {`
          @media (max-width: 992px) {
            .engine-model {
              height: 120px !important;
              max-width: 150px !important;
            }
          }
          @media (max-width: 576px) {
            .engine-model {
              height: 90px !important;
              max-width: 110px !important;
            }
          }
        `}
      </style>
    </div>
  );
};

export default Login;
