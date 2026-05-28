import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { CopyableUHID } from '@/components/CopyableUHID'
import { searchPatientsByName, fetchPatientTasks } from '@/lib/db'

export default function AllPatients() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }
    const id = setTimeout(() => {
      setLoading(true)
      setError(null)
      searchPatientsByName(query, 300)
        .then((rows) => {
          setResults(rows.map((r) => ({ ...r, package_name: state.packages.find((p) => p.id === r.package_id)?.name ?? null })))
        })
        .catch((err) => {
          console.error('Search failed', err)
          setError('Search failed')
        })
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(id)
  }, [query, state.packages])

  async function openPatient(p: any) {
    // Upsert patient into app state so PatientDetail can read it
    dispatch({ type: 'UPSERT_PATIENT', payload: p })
    try {
      const tasks = await fetchPatientTasks([p.id])
      tasks.forEach((t) => dispatch({ type: 'UPSERT_TASK', payload: t }))
    } catch (err) {
      console.warn('Failed to load patient tasks:', err)
    }
    navigate(`/patient/${p.id}`)
  }

  return (
    <div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Search Patients</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type at least 3 characters to search by name"
          className="w-full rounded-md border-gray-200 shadow-sm focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {query.trim().length < 3 ? (
        <p className="text-sm text-gray-500">Please type at least 3 characters to search.</p>
      ) : loading ? (
        <p className="text-sm text-gray-500">Searching…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">UHID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Package</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date of Visit</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-sm text-gray-500">No patients found.</td>
                </tr>
              ) : results.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <button onClick={() => openPatient(p)} className="text-primary-600 hover:underline font-medium">
                      {p.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <CopyableUHID uhid={p.uhid || ''} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.package_name ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.clinic_date ? new Date(p.clinic_date + 'T00:00:00').toLocaleDateString('en-IN') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
