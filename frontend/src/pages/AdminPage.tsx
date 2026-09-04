import { useState } from 'react';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { UsersTab } from '../components/admin/UsersTab';
import { RolesTab } from '../components/admin/RolesTab';
import { GroupsTab } from '../components/admin/GroupsTab';
import { AuditTab } from '../components/admin/AuditTab';
import styles from './AdminPage.module.css';

const TABS = ['Пользователи', 'Роли и права', 'Группы объектов', 'Аудит'] as const;

type Tab = (typeof TABS)[number];

export function AdminPage() {
  const [active, setActive] = useState<Tab>('Пользователи');

  return (
    <Layout>
      <PageHeader title="Админ-панель" />
      <Card>
        <div className={styles.tabs}>
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              className={`${styles.tab} ${active === tab ? styles.tabActive : ''}`}
              onClick={() => setActive(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        {active === 'Пользователи' ? (
          <UsersTab />
        ) : active === 'Роли и права' ? (
          <RolesTab />
        ) : active === 'Группы объектов' ? (
          <GroupsTab />
        ) : (
          <AuditTab />
        )}
      </Card>
    </Layout>
  );
}
