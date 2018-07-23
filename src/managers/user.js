import User from '../entities/user'

export default {

  _users: {},

  add (socketid) {
    let user = new User(socketid)
    this._users[socketid] = user
    return user
  },

  get all () {
    return this._users
  }

/* implement login later
  add (socketid, username, password) {

  },

  login (username, password) {

  }
  */

}
