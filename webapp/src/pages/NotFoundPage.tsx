import { Link } from 'react-router-dom'

export const NotFoundPage = () => {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-card w-full max-w-lg p-8 text-center">
        <p className="text-xs uppercase tracking-[0.15em] text-slate-300">404</p>
        <h1 className="gradient-title mt-2 text-3xl font-medium">Page not found</h1>
        <p className="mt-3 text-sm text-slate-200">The route does not exist in this cloned app scaffold.</p>
        <div className="mt-6">
          <Link to="/" className="btn-primary">
            Return to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
