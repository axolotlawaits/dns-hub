import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { AppShell } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './styles/App.css';
import './styles/Components.css';
import './styles/Handbook.css';
import Home from './Home';
import Finance from '../features/Finance/Finance';
import Login from './Login';
import Navigation from '../components/Navigation';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Accounting from '../features/Accounting/Accounting';
import Ad from '../features/Ad/Ad';
import Aho from '../features/AHO/Aho';
import Visualization from '../features/Visualization/Visualization';
import Jurists from '../features/Jurists/Jurists';
import ProblemBooks from '../features/ProblemBooks/ProblemBooks';
import Service from '../features/Service/Service';
import Settlements from '../features/Settlements/Settlements';
import Supply from '../features/Supply/Supply';
import Transformation from '../features/Transformation/Transformation';
import Automation from '../features/Automation/Automation';
import { useUserContext } from '../hooks/useUserContext';
import MeterReading from '../features/AHO/MeterReading/MeterReading';
import Correspondence from '../features/AHO/Correspondence/Correspondence';
import Branch from './handbook/Branch';
import Employee from './handbook/Employee';
import Handbook from './handbook/Handbook';
import RouteComponent from '../features/Supply/Loaders/RouteComponent';
import LoadersHome from '../features/Supply/Loaders/LoadersHome';
import SupplyDocs from '../features/Accounting/SupplyDocs/SupplyDocs';
import Media from '../features/Ad/Media/Media';
import Retail from '../features/Retail/Retail';
import PrintService from '../features/Retail/PrintService/PrintService';
import Birthday from './Birthday';
import ProfileInfo from './profile/ProfileInfo';
import Profile from './profile/Profile';
import Management from './profile/Management';
import ProtectedRoute from '../components/ProtectedRoute';
import NoAccess from '../components/NoAccess';
import Bookmarks from './Bookmarks';
import Notification from './Notification';

function App() {
  const { user } = useUserContext();
  const [navOpened, { toggle: toggleNav }] = useDisclosure(true);

  return (
    <BrowserRouter>
      <Notifications />
      <Routes>
        <Route path='/*' element={!user ?
          <Navigate to='/login' />
          :
          <AppShell
            layout="alt"
            header={{ height: 60 }}
            footer={{ height: 65 }}
            navbar={{
              width: navOpened ? 225 : 55,
              breakpoint: 'sm',
            }}
            padding="md"
            id='page'
            styles={{
              header: {
                border: 'none'
              },
              navbar: {
                border: 'none'
              },
            }}
          >
            <Header />
            <Navigation 
              navOpened={navOpened} 
              toggleNav={toggleNav} 
            />
            <AppShell.Main id='content'>
              <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/profile' element={<Profile />} />
                <Route path='/profile/info' element={<ProfileInfo />} />
                <Route path='/profile/management' element={user.role !== 'EMPLOYEE' ? <Management /> : <Navigate to='/' />} />
                <Route path='/birthday' element={<Birthday />} />
                <Route path='/bookmarks' element={<Bookmarks />} />
                <Route path='/notification' element={<Notification />} />
                <Route path='/finance' element={<Finance />} />
                <Route path='/accounting' element={<Accounting />} />
                <Route path='/ad' element={<Ad />} />
                <Route path='/aho' element={<Aho />} />
                <Route path='/automation' element={<Automation />} />
                <Route path='/jurists' element={<Jurists />} />
                <Route path='/visualization' element={<Visualization />} />
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
                <Route element={<ProtectedRoute />}>
                  <Route path="/aho/meter-reading" element={<MeterReading />} />
                  <Route path="/aho/correspondence" element={<Correspondence />} />
                  <Route path="/add/media" element={<Media />} />
                  <Route path="/accounting/supply-docs" element={<SupplyDocs />} />
                  <Route path='/supply/loaders' element={<LoadersHome />} />
                  <Route path='/supply/loaders/route/:id' element={<RouteComponent />} />
                </Route>
                <Route path='/retail/print-service' element={<PrintService />} />
              </Routes>
            </AppShell.Main>
            <Footer />
          </AppShell>
        } />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;