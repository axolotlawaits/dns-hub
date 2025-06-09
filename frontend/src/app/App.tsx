import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './styles/App.css'
import './styles/Components.css'
import './styles/Handbook.css'
import Home from './Home'
import Finance from '../features/Finance/Finance'
import Login from './Login'
import Navigation from '../components/Navigation'
import Header from '../components/Header'
import '@mantine/core/styles.css'
import Footer from '../components/Footer'
import Accounting from '../features/Accounting/Accounting'
import Adds from '../features/Adds/Adds'
import Aho from '../features/AHO/Aho'
import Jurists from '../features/Jurists/Jurists'
import ProblemBooks from '../features/ProblemBooks/ProblemBooks'
import Service from '../features/Service/Service'
import Settlements from '../features/Settlements/Settlements'
import Supply from '../features/Supply/Supply'
import Transformation from '../features/Transformation/Transformation'
import Automation from '../features/Automation/Automation'
import { useUserContext } from '../hooks/useUserContext'
import MeterReading from '../features/AHO/MeterReading/MeterReading'
import Correspondence from '../features/AHO/Correspondence/Correspondence'
import Branch from './handbook/Branch'
import Employee from './handbook/Employee'
import Handbook from './handbook/Handbook'
import { useDisclosure } from '@mantine/hooks'
import { AppShell } from '@mantine/core'
import RouteComponent from '../features/Supply/Loaders/RouteComponent'
import LoadersHome from '../features/Supply/Loaders/LoadersHome'
import SupplyDocs from '../features/Accounting/SupplyDocs/SupplyDocs'
import Media from '../features/Adds/Media/Media'
import Retail from '../features/Retail/Retail'
import PrintService from '../features/Retail/PrintService/PrintService'
import Profile from '../app/profile'
import Birthday from '../app/Birthday'

function App() {
  const { user } = useUserContext()
  const [navOpened, { toggle: toggleNav }] = useDisclosure(true)

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/*' element={!user ?
          <Navigate to='/login' />
        :
          <AppShell
            header={{ height: 60 }}
            footer={{ height: 65 }}
            navbar={{
              width: navOpened ? 225 : 55,
              breakpoint: 'sm',
              
            }}
            padding="xl"
            id='page'
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
                <Route path='/birthday' element={<Birthday />} />
                <Route path='/finance' element={<Finance />} />
                <Route path='/accounting' element={<Accounting />} />
                  <Route path="/accounting/supply-docs" element={<SupplyDocs />} />
                <Route path='/add' element={<Adds />} />
                    <Route path="/add/media" element={<Media />} />
                <Route path='/aho' element={<Aho />} />
                  <Route path="/aho/meter-reading" element={<MeterReading />} />
                    <Route path="/aho/correspondence" element={<Correspondence />} />
                <Route path='/automation' element={<Automation />} />
                <Route path='/jurists' element={<Jurists />} />
                <Route path='/problem-books' element={<ProblemBooks />} />
                <Route path='/service' element={<Service />} />
                <Route path='/settlements' element={<Settlements />} />
                <Route path='/retail' element={<Retail />} />
                    <Route path='/retail/print-service' element={<PrintService />} />
                <Route path='/supply' element={<Supply />} />
                  <Route path='/supply/loaders' element={<LoadersHome />} />
                  <Route path='/supply/loaders/route/:id' element={<RouteComponent />} />
                <Route path='/transformation' element={<Transformation />} />
                <Route path='/search/*' element={<Handbook />} />
                <Route path='/branch/:id' element={<Branch />} />
                <Route path='/employee/:id' element={<Employee />} />
              </Routes>
            </AppShell.Main>
            <Footer />
          </AppShell>
        } />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
