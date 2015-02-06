# Stub transport module for Nodemailer

Applies for Nodemailer v1.0

Stub transport does not send anything, it builds the mail stream into a single Buffer and returns it with the sendMail callback. This is useful for testing the emails before actually sending anything.

## Usage

Install with npm

    npm install nodemailer-stub-transport

Require to your script

```javascript
var nodemailer = require('nodemailer');
var stubTransport = require('nodemailer-stub-transport');
```

Create a Nodemailer transport object

```javascript
var transport = nodemailer.createTransport(stubTransport());
```

Send a message

```javascript
transport.sendMail(mailData, function(err, info){
    console.log(info.response.toString());
});
```

### Events

#### 'log'

Debug log object with `{type, message}`

#### 'envelope'

Envelope object

#### 'data'

Data chunk

## License

**MIT**
