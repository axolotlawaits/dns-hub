import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { AppShell } from '@mantine/core';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/carousel/styles.css'
import './styles/App.css';
import './styles/Components.css';
import './styles/Handbook.css';
import { PageHeaderProvider } from '../contexts/PageHeaderContext';
import Home from './Home';
import Finance from '../features/Finance/Finance';
import Login from './Login';
import Navigation from '../components/Navigation';
import { SlideAdmin } from '../components/SlideAdmin';
import Header from '../components/Header';
import Footer from '../components/Footer';
import FloatingActionButton from '../components/FloatingActionButton';
import Accounting from '../features/Accounting/Accounting';
import Ad from '../features/Ad/Ad';
import Aho from '../features/AHO/Aho';
import Jurists from '../features/Jurists/Jurists';
import ProblemBooks from '../features/ProblemBooks/ProblemBooks';
import Service from '../features/Service/Service';
import Settlements from '../features/Settlements/Settlements';
import Supply from '../features/Supply/Supply';
import Transformation from '../features/Transformation/Transformation';
import Automation from '../features/Automation/Automation';
import Safety from '../features/Jurists/Safety/SafetyJournal';
import { useUserContext } from '../hooks/useUserContext';
import MeterReading from '../features/AHO/MeterReading/MeterReading';
import Correspondence from '../features/AHO/Correspondence/Correspondence';
import Branch from './handbook/Branch';
import Employee from './handbook/Employee';
import Handbook from './handbook/Handbook';
import RouteComponent from '../features/Supply/Loaders/RouteComponent';
import LoadersHome from '../features/Supply/Loaders/LoadersHome';
import SupplyDocs from '../features/Accounting/SupplyDocs/SupplyDocs';
import Roc from '../features/Accounting/Roc/Roc';
import Media from '../features/Ad/Media/Media';
import RK from '../features/Ad/RK/RK';
import Merch from '../features/Retail/Merch/Merch';
import Retail from '../features/Retail/Retail';
import PrintService from '../features/Retail/PrintService/PrintService';
import { Scanner } from '../features/Scanner';
import Events from './Events';
import ProfileInfo from './profile/ProfileInfo';
import Profile from './profile/Profile';
import Management from './profile/Management';
import ProtectedRoute from '../components/ProtectedRoute';
import NoAccess from '../components/NoAccess';
import Bookmarks from './Bookmarks';
import Notification from './Notification';
import Radio from '../features/Retail/Radio/Radio';
import Trassir from '../features/Retail/Trassir/Trassir';
import AppStore from '../features/Retail/AppStore/AppStore';
import Shop from '../features/Retail/Shop/Shop';
import FeedbackModule from '../features/Feedback/Feedback';
import BugReports from '../features/Retail/BugReports/BugReports';
import LogViewer from '../components/LogViewer';
import AdminPanel from './profile/AdminPanel';
import Docs from '../features/Docs/Docs';
import { useNotifications } from '../hooks/useNotifications';
import { useEffect, useState } from 'react';
import { API } from '../config/constants';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

function App() {
  const { user } = useUserContext();
  const [navMenuMode, setNavMenuMode] = useState<string>('auto'); // 'auto', 'always_open', 'always_closed'
  const [navOpened, { toggle: toggleNav, open: openNav, close: closeNav }] = useDisclosure(true);
  
  // Инициализируем обработку уведомлений через WebSocket
  useNotifications(user?.id || '');

  // Загрузка настройки режима меню
  useEffect(() => {
    const loadNavMenuModeSetting = async () => {
      if (!user?.id) return;
      
      try {
        const savedSetting = localStorage.getItem('nav_menu_mode');
        if (savedSetting && ['auto', 'always_open', 'always_closed'].includes(savedSetting)) {
          setNavMenuMode(savedSetting);
          // Устанавливаем начальное состояние меню
          if (savedSetting === 'always_open') {
            openNav();
          } else if (savedSetting === 'always_closed') {
            closeNav();
          }
        } else {
          // Пытаемся загрузить из БД
          const token = localStorage.getItem('token');
          if (token) {
            try {
              const response = await fetch(`${API}/user/settings/${user.id}/nav_menu_mode`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              if (response.ok) {
                const data = await response.json();
                if (data.value && ['auto', 'always_open', 'always_closed'].includes(data.value)) {
                  setNavMenuMode(data.value);
                  localStorage.setItem('nav_menu_mode', data.value);
                  if (data.value === 'always_open') {
                    openNav();
                  } else if (data.value === 'always_closed') {
                    closeNav();
                  }
                }
              } else if (response.status === 404) {
                // Настройка не найдена - используем значение по умолчанию
                setNavMenuMode('auto');
                localStorage.setItem('nav_menu_mode', 'auto');
              }
            } catch (fetchError) {
              // Игнорируем ошибки сети, используем значение по умолчанию
              setNavMenuMode('auto');
              localStorage.setItem('nav_menu_mode', 'auto');
            }
          }
        }
      } catch (error) {
        // Используем значение по умолчанию при любой ошибке
        setNavMenuMode('auto');
        localStorage.setItem('nav_menu_mode', 'auto');
      }
    };

    loadNavMenuModeSetting();
  }, [user?.id, openNav, closeNav]);

  // Слушаем изменения настройки меню
  useEffect(() => {
    const handleNavMenuModeChange = (event: CustomEvent) => {
      const newMode = event.detail;
      setNavMenuMode(newMode);
      if (newMode === 'always_open') {
        openNav();
      } else if (newMode === 'always_closed') {
        closeNav();
      }
    };

    window.addEventListener('nav-menu-mode-changed', handleNavMenuModeChange as EventListener);
    return () => {
      window.removeEventListener('nav-menu-mode-changed', handleNavMenuModeChange as EventListener);
    };
  }, [openNav, closeNav]);

  // Обработчик переключения меню с учетом настройки
  const handleToggleNav = () => {
    if (navMenuMode === 'auto') {
      toggleNav();
    }
    // Если режим не 'auto', переключение блокируется
  };

  return (
    <ErrorBoundary>
      <DndProvider backend={HTML5Backend}>
      <BrowserRouter>
        <PageHeaderProvider>
          <Notifications />
          <Routes>
        <Route path='/*' element={!user ?
          <Navigate to='/login' />
          :
          <AppShell
            header={{ height: 64 }}
            footer={{ height: 65 }}
            padding="md"
            navbar={{
              width: navOpened ? 225 : 80,
              breakpoint: 'xl', // Установлено большое значение, чтобы не срабатывало
            }}
        
            id='page'
            styles={{
              header: {
                position: 'fixed',
              },
              navbar: {
                position: 'fixed',

              },
              main: { 
                overflow: 'auto',
                transition: 'margin-left 0.2s ease',  
                backgroundColor: 'var(--theme-bg-primary)'
              },
              footer: {
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
              }
            }}
          >
            <Header navOpened={navOpened} />
            <Navigation 
              navOpened={navOpened} 
              toggleNav={handleToggleNav} 
            />
            <AppShell.Main id='content'>
              <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/profile' element={<Profile />} />
                <Route path='/profile/info' element={<ProfileInfo />} />
                <Route path='/profile/management' element={user.role !== 'EMPLOYEE' ? <Management /> : <Navigate to='/' />} />
                  <Route path='/events' element={<Events />} />
                <Route path='/bookmarks' element={<Bookmarks />} />
                <Route path='/notification' element={<Notification />} />
                <Route path='/slider-admin' element={<SlideAdmin/>} />
                <Route path='/finance' element={<Finance />} />
                <Route path='/accounting' element={<Accounting />} />
                <Route path='/ad' element={<Ad />} />
                <Route path='/aho' element={<Aho />} />
                <Route path='/automation' element={<Automation />} />
                <Route path='/jurists' element={<Jurists />} />
                <Route path='/problem-books' element={<ProblemBooks />} />
                <Route path='/service' element={<Service />} />
                <Route path='/settlements' element={<Settlements />} />
                <Route path='/retail' element={<Retail />} />
                <Route path='/supply' element={<Supply />} />
                <Route path='/transformation' element={<Transformation />} />
                <Route path='/search/*' element={<Handbook />} />
                <Route path='/branch/:id' element={<Branch />} />
                <Route path='/employee/:id' element={<Employee />} />
                <Route path='/no-access' element={<NoAccess />} />

                {/* Защищенные маршруты (требуют доступа через ProtectedRoute) */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/aho/meter-reading" element={<MeterReading />} />
                  <Route path="/aho/correspondence" element={<Correspondence />} />
                  <Route path="/add/media" element={<Media />} />
                  <Route path="/retail/merch" element={<Merch />} />
                  <Route path='/supply/loaders' element={<LoadersHome />} />
                  <Route path='/supply/loaders/route/:id' element={<RouteComponent />} />
                  <Route path='/retail/print-service' element={<PrintService />} />
                  <Route path='/scanner' element={<Scanner />} />
                  <Route path="/accounting/supply-docs" element={<SupplyDocs />} />
                  <Route path="/accounting/contracts-register" element={<Roc />} />
                  <Route path='/jurists/safety' element={<Safety />} />
                  <Route path="/add/rk" element={<RK />} />
                  <Route path='/retail/radio' element={<Radio />} />
                  <Route path='/retail/trassir' element={<Trassir />} />
                  <Route path='/retail/shop' element={<Shop />} />
                  <Route path='/retail/bug-reports' element={<BugReports />} />
                  <Route path='/logs' element={<LogViewer />} />
                  <Route path='/feedback' element={<FeedbackModule />} />
                  <Route path='/docs/*' element={<Docs />} />
                  {user.role === 'DEVELOPER' && (
                    <>
                      <Route path='/admin/branches' element={<AdminPanel initialTab="branches" />} />
                      <Route path='/admin/users' element={<AdminPanel initialTab="users" />} />
                      <Route path='/admin/system' element={<AdminPanel initialTab="system" />} />
                    </>
                  )}
                </Route>
                <Route path='/supply/loaders' element={<LoadersHome />} />
                <Route path='/supply/loaders/route/:id' element={<RouteComponent />} />
                <Route path='/retail/app-store' element={<AppStore />} />
              </Routes>
            </AppShell.Main>
            <Footer />
            <FloatingActionButton />
          </AppShell>
        } />
        <Route path="/login" element={<Login />} />
          </Routes>
        </PageHeaderProvider>
      </BrowserRouter>
      </DndProvider>
    </ErrorBoundary>
  );
}

export default App;