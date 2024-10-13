import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wjlipffnugljjetdjjbe.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbGlwZmZudWdsampldGRqamJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjg4MjQ1MzQsImV4cCI6MjA0NDQwMDUzNH0.9PZfUogXd3I3KJ8PQ7YI8EELq_S5am9RQnMc0BKhiAU'
const supabase = createClient(supabaseUrl, supabaseKey)

export async function getUser(tg_username) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('tg_username', tg_username)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // User not found
      return null
    }
    throw error
  }
  return data
}

export async function createUser(tg_username, public_wallet, PTJSON) {
  const { data, error } = await supabase
    .from('users')
    .insert({ tg_username, public_wallet, PTJSON, wallets: [{ public_key: public_wallet, PTJSON }] })
    .single()

  if (error) throw error
  return data
}

export async function updateUser(tg_username, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('tg_username', tg_username)
    .single()

  if (error) throw error
  return data
}

export async function addWallet(tg_username, public_key, PTJSON) {
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('wallets')
    .eq('tg_username', tg_username)
    .single()

  if (fetchError) throw fetchError

  const updatedWallets = [...(user.wallets || []), { public_key, PTJSON }]

  const { data, error } = await supabase
    .from('users')
    .update({ wallets: updatedWallets })
    .eq('tg_username', tg_username)
    .single()

  if (error) throw error
  return data
}

export async function removeWallet(tg_username, public_key) {
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('wallets')
    .eq('tg_username', tg_username)
    .single()

  if (fetchError) throw fetchError

  const updatedWallets = user.wallets.filter(wallet => wallet.public_key !== public_key)

  const { data, error } = await supabase
    .from('users')
    .update({ wallets: updatedWallets })
    .eq('tg_username', tg_username)
    .single()

  if (error) throw error
  return data
}