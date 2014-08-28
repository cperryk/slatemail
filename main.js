var fs = require('fs');
var $ = require('jquery');
var mailboxView = require('./modules/mailboxView.js');
var messageView = require('./modules/messageView.js');
var imapHandler = require('./modules/imapHandler.js');
var dbHandler = require('./modules/dbHandler.js');

$(function(){

  var BOX = 'List/Slate Ed';
  initialize();

  function initialize(){
    dbHandler.feedIndexedDB(window.indexedDB); //hack-ish, but needed
    dbHandler.connect(function(){
      mailboxView.onSelect(emailSelected);
      update();
    });
  }

  function emailSelected(uid){
    dbHandler.getMailFromLocalBox(BOX, uid, function(mail_obj){
      dbHandler.getThreadMessages(mail_obj.thread_id, function(mail_objs){
        markRead(mail_objs);
        messageView.clear();
        messageView.displayMessages(mail_objs);
      });
    });
  }

  function update(){
    console.log('updatingBox');
    dbHandler.syncBox(BOX, function(){
      mailboxView.clear();
      printMail();
      setTimeout(update, 60000);
    });
    // dbHandler.syncBoxes();
  }

  function markRead(mail_objs){
    mail_objs.forEach(function(mail_obj){
      if(mail_obj.flags.indexOf('\\Seen')===-1){
        imapHandler.markSeen(BOX, mail_obj.uid);
      }
    });
  }
  function printMail(){
    console.log('printing mail');
    var printed_threads = [];
    dbHandler.getMessagesFromMailbox(BOX,function(mail_object){
      if(printed_threads.indexOf(mail_object.thread_id)>-1){
        return;
      }
      mailboxView.printMessage(mail_object);
      printed_threads.push(mail_object.thread_id);
    });
  }

});
