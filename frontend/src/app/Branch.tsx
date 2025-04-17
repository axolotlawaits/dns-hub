import { useParams, useSearchParams } from "react-router"
import { API } from "../config/constants"
import { useEffect, useState } from "react"

export type BranchType = {
  uuid: string
  name: string
  rrs: string
  city: string
  address: string
}

function Branch() {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const [branch, setBranch] = useState<BranchType[]>([])
  const query = searchParams.get('text')
  const id = params.id

  const getBranches = async () => {
    const response = await fetch(`${API}/search/branch?text=${query}`)
    const json = await response.json()
    if (response.ok) {
      setBranch(json)
    }
  }

  const getBranch = async () => {
    const response = await fetch(`${API}/search/branch/${id}`)
    const json = await response.json()
    if (response.ok) {
      setBranch(json)
    }
  }

  useEffect(() => {
    if (query) getBranches()
    if (id) getBranch()
  }, [params.id, searchParams])

  return (
    <div className="branch-card-wrapper">
      {branch.length > 0 && branch.map(branch => {
        return (
          <div key={branch.uuid} className="branch-card">
            <h1>{branch.name}</h1>
            <div className="branch-card-main">
              <div className="branch-card-left">
                <span className="branch-card-text">Город: {branch.city}</span>
                <span className="branch-card-text">РРС: {branch.rrs}</span>
              </div>
              <div className="branch-card-right">
                <span className="branch-card-text">Адрес: {branch.address}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>

  )
}

export default Branch