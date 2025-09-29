import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { AppShell } from '@mantine/core';
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
import Retail from '../features/Retail/Retail';
import PrintService from '../features/Retail/PrintService/PrintService';
import { Scanner } from '../features/Scanner';
import Birthday from './Birthday';
import ProfileInfo from './profile/ProfileInfo';
import Profile from './profile/Profile';
import Management from './profile/Management';
import ProtectedRoute from '../components/ProtectedRoute';
import NoAccess from '../components/NoAccess';
import Bookmarks from './Bookmarks';
import Notification from './Notification';
import Radio from '../features/Retail/Radio/Radio';

function App() {
  const { user } = useUserContext();
  const [navOpened, { toggle: toggleNav }] = useDisclosure(true);

  return (
    <BrowserRouter>
      <PageHeaderProvider>
        <Notifications />
        <Routes>
        <Route path='/*' element={!user ?
          <Navigate to='/login' />
          :
          <AppShell
            layout="alt"
            header={{ height: 64 }}
            footer={{ height: 65 }}
            navbar={{
              width: navOpened ? 225 : 55,
              breakpoint: 'sm',
            }}
            padding={0}
            id='page'
            styles={{
              header: {
                border: 'none',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1000
              },
              navbar: {
                border: 'none',
                position: 'fixed',
                top: '64px',
                left: 0,
                bottom: '65px',
                zIndex: 999
              },
              main: {
                padding: '20px 0 20px 20px',
                margin: 0,
                marginTop: '64px',
                marginLeft: navOpened ? '225px' : '80px',
                marginBottom: '65px',
                height: 'calc(100vh - 64px - 65px)',
                overflow: 'auto',
                transition: 'margin-left 0.2s ease',
                position: 'relative',
                zIndex: 1,
                backgroundColor: 'var(--theme-bg-primary)'
              },
              footer: {
                border: 'none',
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1000
              }
            }}
          >
            <Header navOpened={navOpened} />
            <Navigation 
              navOpened={navOpened} 
              toggleNav={toggleNav} 
            />
            <AppShell.Main id='content' style={{ paddingBottom: '80px' }}>
              <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/profile' element={<Profile />} />
                <Route path='/profile/info' element={<ProfileInfo />} />
                <Route path='/profile/management' element={user.role !== 'EMPLOYEE' ? <Management /> : <Navigate to='/' />} />
                <Route path='/birthday' element={<Birthday />} />
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
                <Route path="/add/rk" element={<RK />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/aho/meter-reading" element={<MeterReading />} />
                  <Route path="/aho/correspondence" element={<Correspondence />} />
                  <Route path="/add/media" element={<Media />} />
                  <Route path='/supply/loaders' element={<LoadersHome />} />
                  <Route path='/supply/loaders/route/:id' element={<RouteComponent />} />
                  <Route path='/retail/print-service' element={<PrintService />} />
                  <Route path='/scanner' element={<Scanner />} />
                  <Route path="/accounting/supply-docs" element={<SupplyDocs />} />
                  <Route path="/accounting/contracts-register" element={<Roc />} />
                  <Route path='/jurists/safety' element={<Safety />} />
                </Route>
                <Route path='/supply/loaders' element={<LoadersHome />} />
                <Route path='/supply/loaders/route/:id' element={<RouteComponent />} />
                <Route path='/retail/radio' element={<Radio />} />
              </Routes>
            </AppShell.Main>
            <Footer />
          </AppShell>
        } />
        <Route path="/login" element={<Login />} />
        </Routes>
      </PageHeaderProvider>
    </BrowserRouter>
  );
}

export default App;