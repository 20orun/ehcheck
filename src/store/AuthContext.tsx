import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/types'
import { parseRole } from '@/types'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  role: AppRole | null
  roleLoading: boolean
  isAdmin: boolean
  isCoordinator: boolean
  isDepartment: boolean
  isDoctor: boolean
  departmentId: string | null
  doctorCode: string | null
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<AppRole | null>(null)
  const [roleLoading, setRoleLoading] = useState(false)

  const fetchRole = useCallback(async (userId: string) => {
    setRoleLoading(true)
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()
    setRole(data?.role ?? null)
    setRoleLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) fetchRole(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        fetchRole(session.user.id)
      } else {
        setRole(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchRole])

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error?.message ?? null }
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setRole(null)
  }

  const { isAdmin, isCoordinator, isDepartment, isDoctor, departmentId, doctorCode } = parseRole(role)

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      role, roleLoading,
      isAdmin, isCoordinator, isDepartment, isDoctor, departmentId, doctorCode,
      signUp, signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
