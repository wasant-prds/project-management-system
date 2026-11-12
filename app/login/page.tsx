import type { Metadata } from 'next'
import { LoginScreen } from '@/components/auth/login-screen'
import './login.css'

export const metadata: Metadata = {
  title: 'เข้าสู่ระบบ · ProjectHub',
  description: 'เข้าสู่พื้นที่ทำงานส่วนตัวของคุณใน ProjectHub',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginScreen />
}
