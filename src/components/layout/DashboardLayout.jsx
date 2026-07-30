import Sidebar from './Sidebar'
import TopBar from './TopBar'

function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-sage">
      <Sidebar />
      <TopBar />
      
      <main className="ml-64 pt-16 p-6">
        {children}
      </main>
    </div>
  )
}

export default DashboardLayout