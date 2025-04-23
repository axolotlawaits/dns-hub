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
import Branch from './handbook/Branch'
import Employee from './handbook/Employee'
import Handbook from './handbook/Handbook'
import { useDisclosure } from '@mantine/hooks'
import { AppShell } from '@mantine/core'

function App() {
  const { user } = useUserContext()
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true)
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure()

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/*' element={!user ?
          <Navigate to='/login' />
        :
          <AppShell
            header={{ height: 60 }}
            navbar={{
              width: 250,
              breakpoint: 'sm',
              collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
            }}
            padding="md"
            id='page'
          >
            <Header 
              desktopOpened={desktopOpened} 
              toggleDesktop={toggleDesktop} 
              mobileOpened={mobileOpened}
              toggleMobile={toggleMobile}
            />
            <Navigation />
            <AppShell.Main id='content'>
              <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/finance' element={<Finance />} />
                <Route path='/accounting' element={<Accounting />} />
                <Route path='/add' element={<Adds />} />
                <Route path='/aho' element={<Aho />} />
                  <Route path="/aho/meter-reading" element={<MeterReading />} />
                <Route path='/automation' element={<Automation />} />
                <Route path='/jurists' element={<Jurists />} />
                <Route path='/problem-books' element={<ProblemBooks />} />
                <Route path='/service' element={<Service />} />
                <Route path='/settlements' element={<Settlements />} />
                <Route path='/supply' element={<Supply />} />
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
