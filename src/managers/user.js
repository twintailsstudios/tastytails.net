import User from '../entities/user'

export default {

  _users: {},

  add (socketid) {
    this._users[socketid] = new User(socketid)
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
