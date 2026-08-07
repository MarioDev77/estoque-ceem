import React from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal modal-${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'teal' }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-icon">{Icon && <Icon size={22} />}</div>
      <div className="stat-info">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {sub && <small className="stat-sub">{sub}</small>}
      </div>
    </div>
  );
}

export function Spinner({ text = 'Carregando…' }) {
  return <div className="spinner">{text}</div>;
}

export function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={40} />}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…' }) {
  return (
    <input
      className="input search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

