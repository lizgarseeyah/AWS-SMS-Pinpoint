var AWS = require('aws-sdk');
var pinpoint = new AWS.Pinpoint({region: process.env.region}); 
///////////////////////////////////////////////////
// https://aws.amazon.com/premiumsupport/knowledge-center/malformed-502-api-gateway/
// See: https://docs.aws.amazon.com/pinpoint/latest/userguide/channels-sms-setup.html
// See: https://docs.aws.amazon.com/pinpoint/latest/userguide/channels-voice-manage.html#channels-voice-manage-request-phone-numbers
///////////////////////////////////////////////////
// Make sure the SMS channel is enabled for the projectId that you specify.

var projectId = process.env.projectId;
// You need a dedicated long code in order to use two-way SMS. 
var originationNumber = process.env.originationNumber;
// This message is spread across multiple lines for improved readability.
var message = "Reply YES to confirm your subscription. 2 msgs per "
            + "month. No purchase req'd. Msg&data rates may apply. Terms: "
            + "example.com/terms-sms";
var messageType = "TRANSACTIONAL";

///////////////////////////////////////////////////
//************************************************//
//*************EXPORT HANDLER**************************//
// Purpose: Handle and parse API data from web form
// exports.handler = (event, context, callback) => {
//   try {
//     let event = JSON.parse(event.body);
//   } catch (e) {
//     event = event.body;
//   }
//   console.log('Received event:', event);

//   // callback response for Postman
//   var response = {
//     "statusCode": 200,
//     "headers": {
//       "my_header": "my_value",
//       "Access-Control-Allow-Origin" : "*", // Required for CORS support to work
//       "Access-Control-Allow-Credentials" : true // Required for cookies, authorization headers with HTTPS 
//     },
//   "body": JSON.stringify(event),
//   "isBase64Encoded": false
//   };
//   // missing return event from try/catch???
//   callback(null, response);
//   // ROOT ISSUE: event = JSON.parse(event.body); from API
//   // is not being passed to validateNumber(event)
//   validateNumber(event)
// };

//************************************************//

///////////////////////////////////////////////////
exports.handler = (event, context, callback) => {
  try {
    event = JSON.parse(event.body);
  } catch (e) {
    event = event.body;
  }
  console.log('Received event:', event);
  // callback response for Postman
  var response = {
    "statusCode": 200,
    "headers": {
      "my_header": "my_value",
      "Access-Control-Allow-Origin" : "*", // Required for CORS support to work
      "Access-Control-Allow-Credentials" : true // Required for cookies, authorization headers with HTTPS 
    },
  "body": JSON.stringify(event),
  "isBase64Encoded": false
  };
  // missing return event from try/catch???
  callback(null, response);
  validateNumber(event);
};

function validateNumber (event) {
  //error gets thrown here: cannot read event.body.destinationNumber, doesn't show up in list
  // only lastName, firstName, and source is accessible, destinationnumber is undefined
  //let destinationNumber = event.destinationNumber;
  var destinationNumber = event.destinationNumber;
  if (destinationNumber.length == 10) {
    destinationNumber = "+1" + destinationNumber;
  }
  var params = {
    NumberValidateRequest: {
      IsoCountryCode: 'US',
      PhoneNumber: destinationNumber
    }
  };
  ///////////////////////////////////////////////////

  pinpoint.phoneNumberValidate(params, function(err, data) {
    if (err) {
      console.log("what's this?", err, err.stack);
    }
    else {
      console.log(data);
      //return data;
      if (data['NumberValidateResponse']['PhoneTypeCode'] == 0) {
        createEndpoint(data, event.firstName, event.lastName, event.source);
      } else {
        console.log("Received a phone number that isn't capable of receiving "
                   +"SMS messages. No endpoint created.");
      }
    }
  });
}
///////////////////////////////////////////////////

function createEndpoint(data, firstName, lastName, source) {
  var destinationNumber = data['NumberValidateResponse']['CleansedPhoneNumberE164'];
  var endpointId = data['NumberValidateResponse']['CleansedPhoneNumberE164'].substring(1);
  
  var params = {
    ApplicationId: projectId,
    // The Endpoint ID is equal to the cleansed phone number minus the leading
    // plus sign. This makes it easier to easily update the endpoint later.
    EndpointId: endpointId,
    EndpointRequest: {
      ChannelType: 'SMS',
      Address: destinationNumber,
      // OptOut is set to ALL (that is, endpoint is opted out of all messages)
      // because the recipient hasn't confirmed their subscription at this
      // point. When they confirm, a different Lambda function changes this 
      // value to NONE (not opted out).
      OptOut: 'ALL',
      Location: {
        PostalCode:data['NumberValidateResponse']['ZipCode'],
        City:data['NumberValidateResponse']['City'],
        Country:data['NumberValidateResponse']['CountryCodeIso2'],
      },
      Demographic: {
        Timezone:data['NumberValidateResponse']['Timezone']
      },
      Attributes: {
        Source: [
          source
        ]
      },
      User: {
        UserAttributes: {
          FirstName: [
            firstName
          ],
          LastName: [
            lastName
          ]
        }
      }
    }
  };
  ///////////////////////////////////////////////////

  pinpoint.updateEndpoint(params, function(err,data) {
    if (err) {
      console.log(err, err.stack);
    }
    else {
      console.log(data);
      //return data;
      sendConfirmation(destinationNumber, lastName);
    }
  });
}
///////////////////////////////////////////////////

function sendConfirmation(destinationNumber, lastName) {
  var x = JSON.stringify(lastName);
  var y = x.replace(/\"/g, "");
  var params = {
    ApplicationId: projectId,
    MessageRequest: {
      Addresses: {
        [destinationNumber]: {
          ChannelType: 'SMS'
        }
      },
      MessageConfiguration: {
        SMSMessage: {
          Body: y,//message,// add customized message here
          MessageType: messageType,
          OriginationNumber: originationNumber
        }
      }
    }
  };
///////////////////////////////////////////////////

  pinpoint.sendMessages(params, function(err, data) {
    // If something goes wrong, print an error message.
    if(err) {
      console.log(err.message);
    // Otherwise, show the unique ID for the message.
    } else {
      console.log("Message sent! " 
          + data['MessageResponse']['Result'][destinationNumber]['StatusMessage']);
    }
  });
}