import { TextInput, PasswordInput, Paper, Button } from '@mantine/core';
import { useState } from 'react';
import { useUserContext } from '../hooks/useUserContext';
import { useNavigate } from 'react-router';
import { API } from '../config/constants';

type LoginType = {
  login: string,
  pass: string
}

type ValidationType = {
  login?: string
  pass?: string
}

function Login() {
  const { login } = useUserContext()
  const [userData, setUserData] = useState<LoginType>({login: '', pass: ''})
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationType>()
  const [ldapError, setLdapError] = useState('')

  const loginUser = async () => {
    setIsLoading(true)
    const response = await fetch(`${API}/user/login`, {
      method: 'POST',
      body: JSON.stringify(userData),
      headers: { 'Content-type': 'application/json' }
    })
    const json = await response.json()
    if (response.ok) {
      setIsLoading(false)
      login(json)
      localStorage.setItem('user', JSON.stringify(json))
      navigate('/')
    } else {
      if (json.errors) {
        setValidationErrors(json.errors)
      } else if (json.ldapError) {
        setLdapError(json.ldapError)
      }
      setIsLoading(false)
    }
  }

  return (
    <div className='page' id='login-page'>
      <Paper w={375} withBorder shadow="md" p={30} mt={30} radius="md">
        <TextInput 
          label="Логин" 
          value={userData.login} 
          onChange={(e) => setUserData({...userData, login: e.target.value})} 
          error={validationErrors?.login || ldapError}
          required 
        />
        <PasswordInput 
          label="Пароль" 
          value={userData.pass} 
          onChange={(e) => setUserData({...userData, pass: e.target.value})}
          error={validationErrors?.pass}
          required mt="md" 
        />
        <Button fullWidth mt="xl" onClick={loginUser} loading={isLoading} color='#818cf8'>
          Войти
        </Button>
        {window.location.host === 'dns-zs.ru' &&
          <Button fullWidth mt="xl" onClick={() => navigate('/')} variant="outline" color='#818cf8'>
            вернуться на сайт
          </Button>
        }
      </Paper>
    </div>
  )
}

export default Login