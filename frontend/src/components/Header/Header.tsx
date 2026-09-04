import { Link, NavLink } from 'react-router';
import { useAuth } from '../../auth';
import { Button } from '../Button/Button';
import styles from './Header.module.css';

const baseLinks = [
  { to: '/devices', label: 'Устройства' },
  { to: '/streams', label: 'Потоки' },
  { to: '/processes', label: 'Записи' },
];

export function Header() {
  const { user, capabilities, logout } = useAuth();

  const links = capabilities.includes('admin:read')
    ? [...baseLinks, { to: '/admin', label: 'Админ' }]
    : baseLinks;

  return (
    <header className={styles.header}>
      <NavLink to="/" className={styles.logo}>
        <span className={styles.logoIcon}>T</span>
        ТИМП-РГР
      </NavLink>
      {user && (
        <nav className={styles.nav}>
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                [styles.navLink, isActive ? styles.navLinkActive : ''].filter(Boolean).join(' ')
              }
            >
              {l.label}
            </NavLink>
          ))}
          <div className={styles.user}>
            <Link to="/profile" className={styles.usernameLink}>{user.username}</Link>
            <Button variant="ghost" size="sm" onClick={logout}>Выход</Button>
          </div>
        </nav>
      )}
    </header>
  );
}
