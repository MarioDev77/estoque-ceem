import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import api from '../api.js';
import { getErrMsg } from '../utils.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@escola.edu.br');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(getErrMsg(err, 'Falha no login.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-icon big"><UtensilsCrossed size={28} /></span>
          <h1>FoodSchool</h1>
          <p>Gestão da Alimentação Escolar</p>
        </div>
        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="login-form">
          <label>
            E-mail
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Senha
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            <LogIn size={18} /> {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <div className="login-hints">
          <p><strong>Demonstração:</strong></p>
          <p>admin@escola.edu.br / admin123</p>
          <p>nutricao@escola.edu.br / nutricao123</p>
          <p>cantina@escola.edu.br / cantina123</p>
          <p>direcao@escola.edu.br / direcao123</p>
        </div>
      </div>
    </div>
  );
}

