import { useState } from 'react';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import { useAuth } from '../auth';
import { UsersTab } from '../components/admin/UsersTab';
import { RolesTab } from '../components/admin/RolesTab';
import { GroupsTab } from '../components/admin/GroupsTab';
import { AuditTab } from '../components/admin/AuditTab';
import { visibleAdminSections } from '../adminAccess';
import styles from './AdminPage.module.css';

function renderTabContent(label: string) {
  switch (label) {
    case 'Пользователи':
      return <UsersTab />;
    case 'Роли и права':
      return <RolesTab />;
    case 'Группы объектов':
      return <GroupsTab />;
    default:
      return <AuditTab />;
  }
}

export function AdminPage() {
  const { capabilities } = useAuth();
  const available = visibleAdminSections(capabilities);
  const tabs = available.map(s => s.label);
  const [active, setActive] = useState('');

  const current = tabs.includes(active) ? active : tabs[0];

  return (
    <Layout>
      <PageHeader title="Админ-панель" />
      <Card>
        {tabs.length === 0 ? (
          <div className={styles.placeholder}>
            <div className={styles.placeholderTitle}>Нет доступных разделов</div>
            <div className={styles.placeholderText}>
              Обратитесь к администратору для назначения прав
            </div>
          </div>
        ) : (
          <>
            <div className={styles.tabs}>
              {tabs.map(tab => (
                <button
                  key={tab}
                  type="button"
                  className={`${styles.tab} ${current === tab ? styles.tabActive : ''}`}
                  onClick={() => setActive(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            {renderTabContent(current)}
          </>
        )}
      </Card>
    </Layout>
  );
}
