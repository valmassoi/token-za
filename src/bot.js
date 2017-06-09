const Bot = require('./lib/Bot')
const SOFA = require('sofa-js')
const Fiat = require('./lib/Fiat')
const Axios = require('axios')
const pizzapi = require('dominos')
const console = require('better-console');

let bot = new Bot()

// ROUTING

bot.onEvent = function(session, message) {
  switch (message.type) {
    case 'Init':
      welcome(session)
      break
    case 'Message':
      onCommand(session, message)
      break
    case 'Command':
      onCommand(session, message)
      break
    case 'Payment':
      onPayment(session, message)
      break
    case 'PaymentRequest':
      welcome(session)
      break
  }
}

function onMessage(session, message) {
  welcome(session)
}

function onCommand(session, command) {
  const content = command.content.value || command.body.toLowerCase()
  //HACK
  const step = session.get('step') || 0
  if(step === 'set-name') {
    setName(session, content)
  }
  if(step === 'set-email') {
    setEmail(session, content)
  }
  if (Number(content) > 10000) {//TODO use step
    storeByZip(session, content)
  }
  switch (content) {
    case 'help':
      welcome(session)
      break
    case 'start':
      startOrder(session)
      break
    case 'cancel':
      startOrder(session)
      break
    case 'get-menu':
      getPrice(session)
      break
    case 'name':
      askName(session)
      break
    case 'next-location':
      storeByZip(session, session.get('zip'))
      break
    case 'ask-item':
      askItem(session)
      break
    case 'get-price':
      getPrice(session)
      break
    case 'large-pep':
      session.set('item', 'Large Pepperoni')
      session.set('itemCode', '3716')
      askName(session)
      break
    case 'med-pep':
      session.set('item', 'Med Pepperoni')
      session.set('itemCode', '3716')
      askName(session)
      break
    case 'large-cheese':
      session.set('item', 'Large Cheese')
      session.set('itemCode', '3716')
      askName(session)
      break
    case 'med-cheese':
      session.set('item', 'Med Cheese')
      session.set('itemCode', '3716')
      askName(session)
      break
    }
}

function onPayment(session, message) {
  if (message.fromAddress == session.config.paymentAddress) {
    // handle payments sent by the bot
    if (message.status == 'confirmed') {
      // perform special action once the payment has been confirmed
      // on the network
    } else if (message.status == 'error') {
      // oops, something went wrong with a payment we tried to send!
    }
  } else {
    // handle payments sent to the bot
    if (message.status == 'unconfirmed') {
      // payment has been sent to the ethereum network, but is not yet confirmed
      const item = session.get('item')
      sendMessage(session, `Payment received for a ${item}! Confirming... this may take a few minutes - I'll send you a text when it's done!`);
    } else if (message.status == 'confirmed') {
      // handle when the payment is actually confirmed!
      sendMessage(session, `Payment confirmed! Your pizza is in the oven 👨‍🍳 (If this was mainnet)`)
      placeOrder(session)
    } else if (message.status == 'error') {
      sendMessage(session, `There was an error with your payment!🚫`);
    }
  }
}

// STATES

function welcome(session) {
  sendMessage(session, `Welcome to Zahh 🍕!
You can order a pizza from Domino's by answering just a few questions (US Only)`)
}

function pong(session) {
  sendMessage(session, `Pong`)
}


// ORDER

function startOrder(session) {
  session.set('step', 'start-order')
  session.reply(
    SOFA.Message({
      body: "Let's find a Domino's location near you. Zip Code?",
      showKeyboard: true
    })
  )
}

function storeByZip(session, zip) {
  session.set('step', 'store-by-zip')
  session.set('zip', zip)
  let location = (session.get('location') >=0) ? (session.get('location') + 1) : 0
  console.log(location);
  session.set('location', location)
  pizzapi.Util.findNearbyStores(
    zip,
    'Delivery',
    function(storeData){
      if(!storeData.result.Stores[location]) {
        location = 0
      }
      const data = storeData.result.Stores[location]
      console.log(data)
      const { StoreID, AddressDescription, IsDeliveryStore, IsOpen } = data
      session.set('storeID', StoreID)
      const carryoutOnly = !IsDeliveryStore && '\nNote: this location is Carryout Only'
      session.reply(SOFA.Message({
        body:  `How's this location:\n${AddressDescription}?${carryoutOnly}`,
        controls: [
          {type: "button", label: "Looks Good!", value: "ask-item"},
          {type: "button", label: "Try another", value: "next-location"},
          {type: "button", label: "Cancel", value: "cancel"},
        ]
      }));
    }
  )
}

function getPrice(session) {
  const storeID = session.get('storeID')
  const item = session.get('itemCode')
  console.log('get menu', storeID);
  var myStore = new pizzapi.Store(
    { ID: storeID }
  )
  return myStore.getMenu(
    function(storeData){
      if(item) {
        console.log(storeData.menuByCode[item])
        const price = storeData.menuByCode[item] ? Number(storeData.menuByCode[item].menuData.Price) : 20
        Fiat.fetch().then((toEth) => {
          let amount = toEth.USD(price)
          session.requestEth(amount, "🍕 order")
        })
      }
    }
  )
}

function askItem(session) {
  session.reply(SOFA.Message({
    body:  `What size Zahh?`,
    controls: [
      {
         type: "group",
         label: "Large 🍕",
         "controls": [
           {type: "button", label: "Large Cheese 🍕", value: "large-cheese"},
           {type: "button", label: "Large Pepperoni 🍕", value: "large-pep"},
         ]
      },
      {
         type: "group",
         label: "Med 🍕",
         "controls": [
           {type: "button", label: "Med Cheese 🍕", value: "med-cheese"},
           {type: "button", label: "Med Pepperoni 🍕", value: "med-pep"},
         ]
      },
    ]
  }));
}

function askName(session) {
  session.reply(
    SOFA.Message({
      body: "Nice choice. What's your name?",
      showKeyboard: true
    })
  )
  session.set('step', 'set-name')
}
function askEmail(session) { //TODO DRY
  session.set('step', 'set-email')
  session.reply(
    SOFA.Message({
      body: "And your email?",
      showKeyboard: true
    })
  )
}

function setName(session, name) {
  const splitName = name.split(" ")
  if(splitName.length === 2) {
    session.set('firstName', splitName[0])
    session.set('lastName', splitName[1])
    askEmail(session)
  } else {
    session.reply(
      SOFA.Message({
        body: "Try name again (two words only)",
        showKeyboard: true
      })
    )
  }
}
function setEmail(session, email) {
  if(true) { // TODO regex
    session.set('email', email)
    getPrice(session)//HACK
  } else {
    session.reply(
      SOFA.Message({
        body: "Try again (bad email)",
        showKeyboard: true
      })
    )
  }
}

function placeOrder(session) {
  console.log('placing order');
  session.set('step', 'place-order')
  const storeID = session.get('storeID')
  var customer = new pizzapi.Customer(
    {
      firstName: session.get('firstName'),
      lastName: session.get('lastName'),
      address: session.get('address'),
      email: session.get('email')
    }
  )
  console.log(customer);
  var order = new pizzapi.Order({
    customer,
    storeID,
    deliveryMethod: 'Carryout'
  })
  const item = session.get('itemCode')
  var newItem = new pizzapi.Item({
    code: item,
    options: {},
    quantity: 1
  })

  order.addItem(newItem)
  var cardNumber = '4100123422343234' //This would be company info (Zahh fronts the Dominos bill for user)
  var cardInfo = new order.PaymentObject()
  cardInfo.Amount = order.Amounts.Customer
  cardInfo.Number = cardNumber
  cardInfo.CardType = order.validateCC(cardNumber)
  cardInfo.Expiration = '0115' //  01/15 just the numbers "01/15".replace(/\D/g,'');
  cardInfo.SecurityCode = '777'
  cardInfo.PostalCode = '90210' // Billing Zipcode
  order.Payments.push(cardInfo)
  console.log(order);
  order.place(
    function(res) {
      console.log("Order placed!", res)
    }
  )
}

// HELPERS

function sendMessage(session, message) {
  let controls = [
    {type: 'button', label: 'Start Order', value: 'start'},
  ]
  session.reply(SOFA.Message({
    body: message,
    controls: controls,
    showKeyboard: false,
  }))
}
