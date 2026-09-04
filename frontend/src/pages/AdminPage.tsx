import { useState } from 'react';
import { Layout, PageHeader, Card } from '../components/Layout/Layout';
import styles from './AdminPage.module.css';

const TABS = ['Пользователи', 'Роли и права', 'Группы объектов'] as const;

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
        <div className={styles.placeholder}>
          <div className={styles.placeholderTitle}>{active}</div>
          <div className={styles.placeholderText}>Раздел в разработке</div>
        </div>
      </Card>
    </Layout>
  );
}
