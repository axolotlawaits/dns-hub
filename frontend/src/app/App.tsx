import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import './App.css'
import Home from './Home'
import Login from './Login'
import Search from '../components/Search'
import Navigation from '../components/Navigation'
import Menu from '../components/Menu'
import { AppShell, Burger, Group, Skeleton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

const user = 'mockuser'

function App() {
  const [opened, { toggle }] = useDisclosure()

  return (
    <BrowserRouter>
      <Routes>
        <Route path='/*' element={!user ?
          <Navigate to='/login' />
        :
          <div id="page">
            <div id='layout'>
              <Menu></Menu>
              <div id='content'>
                <Search></Search>
                <Routes>
                  <Route path='/' element={<Home />} />
                </Routes>
              </div>
            </div>
            <Navigation />
          </div>
        } />
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
