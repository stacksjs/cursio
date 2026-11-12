import { Action } from '@stacksjs/actions'
import { response } from '@stacksjs/router'
import { academiesForStaff } from '../../Support/academies'
import { coursesInAcademy } from '../../Support/courses'
import { userIdOf } from '../../Support/http'
import { banksOf } from '../../Support/banks'

export default new Action({
  name: 'StudioOverview',
  description: 'The academy a staff member runs and its courses',
  method: 'GET',

  async handle(request: RequestInstance) {
    const userId = await userIdOf(request)
    if (!userId)
      return response.unauthorized('Authentication required')

    const academies = await academiesForStaff(userId)
    const requested = Number(request.get('academy_id')) || null
    const academy = academies.find(row => row.id === requested) ?? academies[0] ?? null

    // No academy yet is an ordinary state (a new account), not an error.
    if (!academy)
      return response.json({ academy: null, academies: [], courses: [], banks: [] })

    return response.json({ academy, academies, courses: await coursesInAcademy(academy), banks: await banksOf(academy) })
  },
})
