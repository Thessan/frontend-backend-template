import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import mongoose from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { isEmail } from 'validator'

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost/authAPI"
mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true })
mongoose.Promise = Promise

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true
  },
  email: {
    type: String,
    required: true,
    validate: [isEmail, 'invalid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 5,
    maxlength: 12
  },
  accessToken: {
    type: String,
    default: () => crypto.randomBytes(128).toString('hex'),
    unique: true
  }
})

userSchema.pre("save", async function (next) {
  const user = this;

  if (!user.isModified('password')) {
    return next();
  }

  //Hash the password, after the validation of sign up details
  const salt = bcrypt.genSaltSync();
  user.password = bcrypt.hashSync(user.password, salt);

  next();
})

const User = mongoose.model('User', userSchema);


//Defines the port the app will run on
const port = process.env.PORT || 8080
const app = express()
const listEndpoints = require('express-list-endpoints')

//Function that expects the users access token and validate access to restricted endpoints
const authenticateUser = async (request, response, next) => {

  const user = await User.findOne({ accessToken: request.header('Authorization') });

  if (user) {
    request.user = user;
    next();
  } else {
    response.status(401).json({ message: 'Sorry, authentication failed' });
  }
}

//Add middlewares to enable cors and json body parsing
app.use(cors())
app.use(bodyParser.json())


//Middleware function
app.use((request, response, next) => {
  if (mongoose.connection.readyState === 1) {
    next()
  } else {
    response.status(503).json({ error: 'Service unavailable' })
  }
})

//Main page
app.get('/', async (request, response) => {
  response.send('Welcome, see endpoints to our API below.')
  if (response) {
    response.status(200).send(listEndpoints(app))
  } else {
    response.status(404).send("No endpoints found.")
  }
})

//SIGN UP ENDPOINT
//This endpoint registers the user & put it in the database
app.post('/users', async (request, response) => {
  try {
    const { username, email, password } = request.body;

    //This const creates a new user and stores username, email and the encrypted password in the database
    const user = await new User({
      username,
      email,
      password,
    }).save();

    response.status(200).json({ userID: user._id, accessToken: user.accessToken }); //Sign up success
  }
  catch (err) {
    response.status(400).json({ message: 'Sorry, could not create user', errors: err }); // Sign up error
  }
})

// LOGIN ENDPOINT
//This endpoint expects username and password from already existing users
app.post('/sessions', async (request, response) => {
  try {

    const { username, password } = request.body;
    const user = await User.findOne({ username });

    if (user && bcrypt.compareSync(password, user.password)) {
      response.status(200).json({ userId: user._id, accessToken: user.accessToken }); //Success
    } else {
      throw 'Incorrect username or password'; //If user that's signed up is trying to login but login details are incorrect
    }
  } catch (err) {
    response.status(404).json({ error: 'Sorry, user does not exist' }); //If a user that's not signed up is trying to login
  }
});

//Restricted endpoint, only accessible after user has logged in with valid username and access token
app.get('/sessions/:id/userMessage', authenticateUser);
app.get('/sessions/:id/userMessage', async (request, response) => {

  const userMessage = `Welcome, ${request.user.username}, you're now logged in!`

  response.status(201).json(userMessage)
});

app.get('sessions/:id', async (request, response) => {
  response.status(501).send();
});

//Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
