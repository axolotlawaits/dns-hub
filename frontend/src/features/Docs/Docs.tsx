// features/Docs/Docs.tsx
import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Container, Title, Tabs, Button, Group, SegmentedControl } from '@mantine/core';
import { IconList, IconStar, IconFileText, IconPlus, IconApps } from '@tabler/icons-react';
import { useUserContext } from '../../hooks/useUserContext';
import { API } from '../../config/constants';
import { fetchWithAuth } from '../../utils/fetchWithAuth';
import ArticleList from './components/ArticleList';
import CategoryTree from './components/CategoryTree';
import ArticleSearch from './components/ArticleSearch';
import ArticleView from './components/ArticleView';
import ArticleEditor from './components/ArticleEditor';
import './Docs.css';

function DocsList() {
  const { user } = useUserContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Загружаем предпочтение пользователя из UserSettings
  useEffect(() => {
    const loadViewMode = async () => {
      if (!user?.id) return;
      
      try {
        const response = await fetchWithAuth(`${API}/user/settings/${user.id}/docs_view_mode`);
        if (response && response.ok) {
          const data = await response.json();
          const savedMode = data?.value;
          if (savedMode === 'list' || savedMode === 'grid') {
            setViewMode(savedMode);
          }
        }
      } catch (error) {
        console.error('Ошибка при загрузке настройки отображения:', error);
        // В случае ошибки используем базовый вариант - список
        setViewMode('list');
      }
    };

    loadViewMode();
  }, [user?.id]);

  // Сохраняем предпочтение пользователя в UserSettings
  useEffect(() => {
    const saveViewMode = async () => {
      if (!user?.id) return;
      
      try {
        const response = await fetchWithAuth(`${API}/user/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.id,
            parameter: 'docs_view_mode',
            value: viewMode,
          }),
        });
        
        if (!response || !response.ok) {
          console.error('Ошибка при сохранении настройки отображения');
        }
      } catch (error) {
        console.error('Ошибка при сохранении настройки отображения:', error);
      }
    };

    // Сохраняем только если пользователь загружен и это не первая инициализация
    if (user?.id) {
      saveViewMode();
    }
  }, [viewMode, user?.id]);

  return (
    <Container size="fluid" py="md" style={{ maxWidth: '95%' }}>
      <Group justify="space-between" mb="lg">
        <Title order={1}>База знаний</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => navigate('/docs/articles/new')}
        >
          Создать статью
        </Button>
      </Group>
      
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* Левая панель: Категории */}
        <div style={{ width: '250px', flexShrink: 0 }}>
          <CategoryTree 
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
          />
        </div>

        {/* Центральная часть: Статьи */}
        <div style={{ flex: 1 }}>
          <Group justify="space-between" mb="md">
            <ArticleSearch 
              value={searchQuery}
              onChange={setSearchQuery}
            />
            {/* Переключатель формата отображения - общий для всех вкладок */}
            <SegmentedControl
              value={viewMode}
              onChange={(value) => setViewMode(value as 'list' | 'grid')}
              data={[
                { label: <IconList size={16} />, value: 'list' },
                { label: <IconApps size={16} />, value: 'grid' }
              ]}
              size="sm"
            />
          </Group>

          <Tabs value={activeTab} onChange={setActiveTab} mt="md">
            <Tabs.List>
              <Tabs.Tab value="all" leftSection={<IconList size={16} />}>
                Все статьи
              </Tabs.Tab>
              <Tabs.Tab value="favorites" leftSection={<IconStar size={16} />}>
                Избранное
              </Tabs.Tab>
              <Tabs.Tab value="my" leftSection={<IconFileText size={16} />}>
                Мои статьи
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="all" pt="md">
              <ArticleList 
                categoryId={selectedCategory}
                searchQuery={searchQuery}
                authorId={null}
                favoritesOnly={false}
                viewMode={viewMode}
              />
            </Tabs.Panel>

            <Tabs.Panel value="favorites" pt="md">
              <ArticleList 
                categoryId={selectedCategory}
                searchQuery={searchQuery}
                authorId={null}
                favoritesOnly={true}
                viewMode={viewMode}
              />
            </Tabs.Panel>

            <Tabs.Panel value="my" pt="md">
              <ArticleList 
                categoryId={selectedCategory}
                searchQuery={searchQuery}
                authorId={user?.id || null}
                favoritesOnly={false}
                viewMode={viewMode}
              />
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>
    </Container>
  );
}

function Docs() {
  return (
    <Routes>
      <Route path="/" element={<DocsList />} />
      <Route path="/articles/new" element={<ArticleEditor />} />
      <Route path="/articles/:slug" element={<ArticleView />} />
      <Route path="/articles/:slug/edit" element={<ArticleEditor />} />
    </Routes>
  );
}

export default Docs;

