const User = require("../models/User");
const fetch = require("node-fetch");
const jwt = require("jsonwebtoken");
const { sendTokenResponse } = require("../middleware/utils");
const { sendEmail } = require("../middleware/email");
const {
  registerValidations,
  loginValidations,
} = require("../middleware/validation");
const { google } = require("googleapis");
const { OAuth2 } = google.auth;
const client = new OAuth2(process.env.GOOGLE_CLIENT_ID);
const { CLIENT_URL } = process.env;

//get logged in user
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
};
//register user locally
exports.registration = async (req, res) => {
  const { error } = registerValidations(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  const { name, email, password } = req.body;

  try {
    let user = await User.findOne({ email });

    if (user) {
      return res.status(400).json("User already exist");
    }
    user = new User({
      name,
      email,
      password,
    });

    const activation_token = jwt.sign(
      {
        user,
      },
      process.env.ACTIVATION_TOKEN_SECRET,
      {
        expiresIn: "15m",
      }
    );
    const resetUrl = `${CLIENT_URL}/activate/${activation_token}`;
    await sendEmail(
      user.email,
      "Activate your acount",
      {
        name: "new charge",
        link: resetUrl,
      },
      "../helpers/templates/activate.ejs"
    );
    return res.json({ msg: "Email sent successfully, check your ibox" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send(err + " Server error");
  }
};

//login user locally
exports.login = async (req, res) => {
  const { error } = loginValidations(req.body);
  if (error) return res.status(400).send(error.details[0].message);
  const { email, password } = req.body;
  try {
    let user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(400).json("user not found");
    }
    //check if password matches
    const isMatch = await user.matchPassword(password);
    // const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json("invalid credentials");
    }
    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(err.message);
    res.status(500).send(err + " Server error");
  }
};

//google login
exports.googleLogin = async (req, res) => {
  try {
    const { tokenId } = req.body;

    const verify = await client.verifyIdToken({
      idToken: tokenId,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email_verified, email, name, picture } = verify.payload;
    const password = email + process.env.GOOGLE_CLIENT_SECRET;
    if (!email_verified) {
      return res.status(400).json({ msg: "Email verification failed." });
    }

    const user = await User.findOne({ email });

    if (user) {
      const validate = await user.matchPassword(password);
      if (!validate) {
        return res.status(400).json({ msg: "Password is incorrect." });
      }
      sendTokenResponse(user, 200, res);
    } else {
      const newUser = new Users({
        name,
        email,
        password,
        avatar: picture,
      });
      await newUser.save();
      sendTokenResponse(user, 200, res);
    }
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
};

exports.facebookLogin = async (req, res) => {
  const { accessToken, userID } = req.body;
  try {
    const URL = `https://graph.facebook.com/v2.9/${userID}/?fields=id,name,email,picture&access_token=${accessToken}`;

    const data = await fetch(URL)
      .then((res) => res.json())
      .then((res) => {
        return res;
      });

    const { email, name, picture } = data;

    const password = email + process.env.FACEBOOK_SECRET;
    const user = await User.findOne({ email });

    if (user) {
      const validate = await user.matchPassword(password);
      if (!validate) {
        return res.status(400).json({ msg: "Password is incorrect." });
      }
      sendTokenResponse(user, 200, res);
    } else {
      const newUser = new User({
        name,
        email,
        password: passwordHash,
        avatar: picture.data.url,
      });

      await newUser.save();

      sendTokenResponse(user, 200, res);
    }
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
};
exports.githubLogin = async (req, res) => {
  const { code } = req.body.response;
  try {
    const URL = `https://github.com/login/oauth/access_token`;

    const body = {
      client_id: process.env.GITHUB_ID,
      client_secret: process.env.GITHUB_SECRET,
      code: code,
    };

    const data = await fetch(URL, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.text())
      .then((res) => {
        let params = new URLSearchParams(res);
        const access_token = params.get("access_token");
        // Request to return data of a user that has been authenticated
        return fetch(`https://api.github.com/user`, {
          headers: {
            Authorization: `token ${access_token}`,
          },
        });
      })
      .then((response) => response.json())
      .then((response) => {
        return response;
      });
    console.log(data);

    // const { login, name, picture } = data;

    // const password = login + process.env.GITHUB_SECRET;
    // const user = await User.findOne({ login });

    // if (user) {
    //   const validate = await user.matchPassword(password);
    //   if (!validate) {
    //     return res.status(400).json({ msg: "Password is incorrect." });
    //   }

    //   sendTokenResponse(user, 200, res);
    // } else {
    //   const newUser = new User({
    //     name,
    //     login,
    //     password: passwordHash,
    //     avatar: picture.data.url,
    //   });

    //   await newUser.save();

    //   sendTokenResponse(user, 200, res);
    // }
  } catch (err) {
    return res.status(500).json({ msg: err.message });
  }
};
