import { useEffect, useState } from 'react'
import { api, type ReviewRecord } from '@/services/api'

/** Local development only: every tester review with its screenshots, newest first. */
export default function DevReviews(): JSX.Element {
  const [reviews, setReviews] = useState<ReviewRecord[] | null>(null)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    api.reviews
      .list()
      .then(setReviews)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reviews'))
  }, [])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Reviews</h1>
      <p className="mb-6 text-sm text-slate-500">Local development only. Newest first.</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!reviews && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {reviews && reviews.length === 0 && <p className="text-sm text-slate-500">No reviews yet.</p>}

      <ul className="space-y-4">
        {reviews?.map((review) => (
          <li key={review.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{review.user_email ?? review.user_id}</span>
              <span>{new Date(review.created_at).toLocaleString()}</span>
              {review.page_path && <span className="font-mono">{review.page_path}</span>}
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-900">{review.message}</p>
            {review.image_urls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {review.image_urls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="Screenshot" className="h-24 w-24 rounded border object-cover" />
                  </a>
                ))}
              </div>
            )}
            {review.user_agent && <p className="mt-3 truncate text-xs text-slate-400">{review.user_agent}</p>}
          </li>
        ))}
      </ul>
    </main>
  )
}
