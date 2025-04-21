import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './styles/App.css'
import './styles/Components.css'
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
import BranchSearch from './BranchSearch'
import Branch from './Branch'

function App() {
  const { user } = useUserContext()

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/*' element={!user ?
          <Navigate to='/login' />
        :
          <div id="page">
            <Header />
            <div id='layout'>
              <Navigation />
              <div id='content'>
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
                  <Route path='/branch/:id' element={<Branch />} />
                  <Route path='/branch/*' element={<BranchSearch />} />
                </Routes>
              </div>
            </div>
            <Footer />
          </div>
        } />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
