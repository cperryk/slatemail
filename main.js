var fs = require('fs');
var MailParser = require("mailparser").MailParser;
var Box = require('./modules/mailboxView.js');
var MessageViewer = require('./modules/messageView.js');

var $ = require('jquery');


$(function(){

  updateBox();

  function updateBox(){
    printMail();
    dbhandler.syncBox('INBOX', function(){
      setTimeout(updateBox, 60000);
    });
  }

  var viewer = new MessageViewer();

  var box = new Box({
    on_select:function(uid){
      console.log(uid);
      dbhandler.getMailFromLocalBox('INBOX',uid,function(mail_obj){
        viewer.clear();
        dbhandler.getThreadMessages(mail_obj.thread_id, function(mail_objs){
          viewer.displayMessages(mail_objs);
        });
      });
    }
  });

  function printMail(){
    var printed_threads = [];
    dbhandler.getMessagesFromMailbox('INBOX',function(mail_object){
      if(printed_threads.indexOf(mail_object.thread_id)>-1){
        return;
      }
      box.printMessage(mail_object);
      printed_threads.push(mail_object.thread_id);
    });
  }

});
